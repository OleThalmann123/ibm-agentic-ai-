const fs = require('fs');
const _path = require('path');

const files = [
  'apps/prototyp-1-v1/src/contexts/AuthContext.tsx',
  'apps/prototyp-1-v1/src/components/settings/SettingsPage.tsx',
  'apps/prototyp-1-v1/src/components/assistants/AssistantsPage.tsx',
  'apps/prototyp-1-v1/src/components/auth/LoginPage.tsx',
  'apps/prototyp-1-v1/src/components/auth/TokenLoginPage.tsx',
  'apps/prototyp-1-v1/src/components/layout/AppShell.tsx',
  'apps/prototyp-1-v1/src/components/dashboard/LohnbudgetRechner.tsx',
  'apps/prototyp-1-v1/src/components/dashboard/DashboardPage.tsx',
  'apps/prototyp-1-v1/src/components/payroll/PayrollPage.tsx',
  'apps/prototyp-1-v1/src/components/onboarding/AssistantOnboarding.tsx',
  'apps/prototyp-1-v1/src/components/onboarding/OnboardingPage.tsx',
  'apps/prototyp-1-v1/src/components/onboarding/EmployerOnboarding.tsx',
  'apps/prototyp-1-v1/src/App.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/@\/lib\/[^']+/g, '@asklepios/backend');
    fs.writeFileSync(file, content);
  }
});
console.log('Imports replaced successfully.');
