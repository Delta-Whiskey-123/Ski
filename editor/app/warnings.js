// The warning list. Shows what analyse() reported; computes nothing itself.
// Clicking a warning asks main.js to show the place and select what is involved.

export function createWarningList(root, heading, store, onPick) {
  function render() {
    const warnings = store.analysis.warnings;
    const errors = warnings.filter((w) => w.severity === 'error').length;
    heading.textContent = warnings.length
      ? `Warnings: ${errors ? `${errors} error${errors === 1 ? '' : 's'}, ` : ''}${warnings.length - errors} warning${warnings.length - errors === 1 ? '' : 's'}`
      : 'Warnings: none. The course passes every rule.';
    heading.className = errors ? 'error' : warnings.length ? 'warning' : 'ok';
    root.replaceChildren();
    for (const w of warnings) {
      const li = document.createElement('li');
      li.className = w.severity;
      li.tabIndex = 0;
      const where = document.createElement('b');
      where.textContent = `${Math.round(w.z)} m`;
      li.append(where, ` ${w.message}`);
      li.title = `Rule: ${w.rule}. Click to go there.`;
      li.addEventListener('click', () => onPick(w));
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') onPick(w); });
      root.append(li);
    }
  }
  return { render };
}
