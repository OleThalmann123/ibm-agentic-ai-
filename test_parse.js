function parseResponse(content) {
  let cleaned = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  
  // Find first { and last }
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return JSON.parse(cleaned);
}
let m = "Here is it:\n```json\n{\"a\":1}\n```";
console.log(parseResponse(m));
