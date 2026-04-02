const fs = require('fs');
const path = require('path');

const apiKey = "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";
const dir = '/Users/olethalmann/Downloads/IBM neu ';

async function describeImage(fileName) {
  const filePath = path.join(dir, fileName);
  const base64Image = fs.readFileSync(filePath, { encoding: 'base64' });

  const body = {
    model: "anthropic/claude-3-haiku",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Identify which part of our web app this screenshot represents. Look at the title and content. We have 3 flows: 1) Onboarding affected person (employer setup/preferences), 2) Onboarding assistant person (contract upload, AI extraction, profile creation), 3) Time tracking assistant person (mobile logging, review). Answer with the flow name, an English action title, and a brief description of EXACTLY what is seen in the image (no AI fluff, to the point)."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Image}`
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log(`\n\n=== ${fileName} ===\n`);
    if (data.choices && data.choices[0] && data.choices[0].message) {
      console.log(data.choices[0].message.content);
    } else {
      console.log("Error:", JSON.stringify(data));
    }
  } catch (err) {
    console.log(`Failed for ${fileName}:`, err.message);
  }
}

async function main() {
  const files = fs.readdirSync(dir).filter(f => f.startsWith('Scc_Ole_2026-04') && f.endsWith('.png'));
  // sort naturally
  files.sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
  for (const file of files) {
    await describeImage(file);
    // slight delay to not hit rate limits
    await new Promise(r => setTimeout(r, 700));
  }
}

main();
