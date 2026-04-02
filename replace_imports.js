const fs = require('fs');
const _path = require('path');

const files = [
  'apps/v2/src/contexts/AuthContext.tsx',
  'apps/v2/src/components/settings/SettingsPage.tsx',
  'apps/v2/src/components/assistants/AssistantsPage.tsx',
  'apps/v2/src/components/auth/LoginPage.tsx',
  'apps/v2/src/components/auth/TokenLoginPage.tsx',
  'apps/v2/src/components/layout/AppShell.tsx',
  'apps/v2/src/components/dashboard/LohnbudgetRechner.tsx',
  'apps/v2/src/components/dashboard/DashboardPage.tsx',
  'apps/v2/src/components/payroll/PayrollPage.tsx',
  'apps/v2/src/components/onboarding/AssistantOnboarding.tsx',
  'apps/v2/src/components/onboarding/OnboardingPage.tsx',
  'apps/v2/src/components/onboarding/EmployerOnboarding.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/@\/(agent|backend|shared)\/[^']+/g, '@asklepios/backend');
  fs.writeFileSync(file, content);
});
console.log('Imports replaced successfully.');
