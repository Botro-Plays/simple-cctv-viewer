const { execSync } = require('child_process');
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const tag = `v${pkg.version}`;

console.log(`[push-with-tag] Current version: ${pkg.version}`);

// Stage everything
try {
  execSync('git add -A', { stdio: 'inherit' });
} catch {
  // nothing to stage
}

// Commit if there are changes
const status = execSync('git status --short').toString().trim();
if (status) {
  console.log('[push-with-tag] Committing changes...');
  execSync('git commit -m "build: auto-commit before push"', { stdio: 'inherit' });
}

// Create tag if it doesn't exist
try {
  execSync(`git rev-parse ${tag}`, { stdio: 'pipe' });
  console.log(`[push-with-tag] Tag ${tag} already exists`);
} catch {
  console.log(`[push-with-tag] Creating tag ${tag}...`);
  execSync(`git tag ${tag}`, { stdio: 'inherit' });
}

// Push branch and tags
console.log('[push-with-tag] Pushing branch and tags...');
execSync('git push origin main', { stdio: 'inherit' });
execSync('git push origin --tags', { stdio: 'inherit' });

console.log(`[push-with-tag] Done. Pushed ${tag}`);
