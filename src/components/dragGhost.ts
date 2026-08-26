// 自定义拖拽幽灵：用一枚小徽片替代浏览器默认的整块元素截图。
export function setDragGhost(e: React.DragEvent, label: string) {
  const el = document.createElement('div')
  el.className = 'drag-ghost'
  el.textContent = label
  document.body.appendChild(el)
  e.dataTransfer.setDragImage(el, 14, 16)
  setTimeout(() => el.remove(), 0)
}
