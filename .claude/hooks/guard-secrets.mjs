// PreToolUse hook: stops Claude from reading, printing or committing anything in the /.secrets folder.
// Test scripts read .secrets themselves (inside node) and never print it; this only guards the tool calls Claude makes.
// Exit code 2 = blocked (the message on stderr is shown to Claude).
import fs from "node:fs";

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const tool = input.tool_name ?? "";
const ti = input.tool_input ?? {};
const block = (why) => { process.stderr.write(`Blocked by guard-secrets: ${why}. Never read, print or commit /.secrets (see CLAUDE.md).\n`); process.exit(2); };
const inSecrets = (s) => /(^|[\\/\s"'=])\.secrets([\\/\s"']|$)/i.test(String(s ?? ""));

if (tool === "Read" && inSecrets(ti.file_path)) block("reading a file in .secrets");
if (tool === "Grep" && inSecrets(ti.path)) block("searching inside .secrets");
if (tool === "Edit" || tool === "Write") { if (inSecrets(ti.file_path)) block("editing a file in .secrets"); }

if (tool === "Bash" || tool === "PowerShell") {
  const cmd = String(ti.command ?? "");
  if (inSecrets(cmd)) {
    const safe = /^\s*(git\s+check-ignore|ls|dir|Get-ChildItem|test|stat)\b/i.test(cmd) && !/[|;&]\s*(cat|type|head|tail|grep|Get-Content)/i.test(cmd);
    const reads = /\b(cat|type|head|tail|less|more|echo|printf|grep|egrep|rg|sed|awk|cut|sort|xxd|od|base64|strings|Get-Content|gc|Select-String|sls|cp|copy|Copy-Item|mv|curl|wget|source|git\s+(add|commit|stash|diff|show|log))\b/i.test(cmd);
    if (reads && !safe) block("this command would read or copy .secrets");
  }
  if (/git\s+add\s+(-f|--force)/i.test(cmd) && /secret|\.env/i.test(cmd)) block("force-adding a secrets file to git");
  if (/\b(printenv|Get-ChildItem\s+env:|env\s*\|)/i.test(cmd) && /(KEY|PASSWORD|SECRET|TOKEN)/i.test(cmd)) block("dumping secret environment variables");
}
process.exit(0);
