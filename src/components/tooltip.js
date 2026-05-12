function getNode() {
  let n = document.getElementById('chart-tooltip');
  if (!n) {
    n = document.createElement('div');
    n.id = 'chart-tooltip';
    n.className = 'chart-tooltip';
    n.setAttribute('role', 'tooltip');
    document.body.appendChild(n);
  }
  return n;
}

export const chartTooltip = {
  show(html, clientX, clientY) {
    const t = getNode();
    t.innerHTML = html;
    t.classList.add('is-visible');
    const pad = 14;
    let left = clientX + pad;
    let top = clientY + pad;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
    const rect = t.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      left = Math.max(8, clientX - rect.width - pad);
      t.style.left = `${left}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      top = Math.max(8, clientY - rect.height - pad);
      t.style.top = `${top}px`;
    }
  },
  move(clientX, clientY) {
    const t = document.getElementById('chart-tooltip');
    if (!t || !t.classList.contains('is-visible')) return;
    const pad = 14;
    let left = clientX + pad;
    let top = clientY + pad;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
    const rect = t.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      left = Math.max(8, clientX - rect.width - pad);
      t.style.left = `${left}px`;
    }
    if (rect.bottom > window.innerHeight - 8) {
      top = Math.max(8, clientY - rect.height - pad);
      t.style.top = `${top}px`;
    }
  },
  hide() {
    const t = document.getElementById('chart-tooltip');
    if (t) t.classList.remove('is-visible');
  },
};
