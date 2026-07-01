#!/usr/bin/env bash
# PostToolUse hook: run ESLint --fix on edited .ts/.tsx/.astro files
FILE=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const f=JSON.parse(d).tool_input.file_path;if(/\.(ts|tsx|astro)$/.test(f))process.stdout.write(f)}catch(e){}})")
if [ -n "$FILE" ]; then
  npx eslint --fix "$FILE" 2>/dev/null || true
fi
