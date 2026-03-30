function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inlineMd(s: string): string {
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>')
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" title="$1">$1</a>')
  return s
}

export function renderMarkdown(src: string): string {
  const blocks: string[] = []
  let md = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push('<pre><code>' + escHtml(code) + '</code></pre>')
    return '\x01' + (blocks.length - 1) + '\x01'
  })
  md = md.replace(/`([^`\n]+)`/g, (_, code) => {
    blocks.push('<code>' + escHtml(code) + '</code>')
    return '\x01' + (blocks.length - 1) + '\x01'
  })

  md = escHtml(md)

  const lines = md.split('\n')
  let out = '', inUl = false, inOl = false, inTable = false

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const isUl = /^[\-\*] /.test(line)
    const isOl = /^\d+\. /.test(line)
    const isTableRow = /^\|(.+)\|$/.test(line.trim())

    if (inUl && !isUl) { out += '</ul>'; inUl = false }
    if (inOl && !isOl) { out += '</ol>'; inOl = false }
    if (inTable && !isTableRow) { out += '</tbody></table>'; inTable = false }

    if (isTableRow) {
      const cells = line.trim().slice(1, -1).split('|').map(c => c.trim())
      if (cells.every(c => /^[-:]+$/.test(c))) continue
      if (!inTable) {
        inTable = true
        out += '<table><thead><tr>' + cells.map(c => '<th>' + inlineMd(c) + '</th>').join('') + '</tr></thead><tbody>'
      } else {
        out += '<tr>' + cells.map(c => '<td>' + inlineMd(c) + '</td>').join('') + '</tr>'
      }
      continue
    }

    const hm = line.match(/^(#{1,4}) (.+)$/)
    if (hm) {
      const lv = Math.min(hm[1].length + 2, 6)
      out += '<h' + lv + '>' + inlineMd(hm[2]) + '</h' + lv + '>'
      continue
    }
    if (/^[-*_]{3,}$/.test(line.trim())) { out += '<hr>'; continue }
    if (/^&gt; /.test(line)) {
      out += '<blockquote>' + inlineMd(line.slice(5)) + '</blockquote>'
      continue
    }
    if (isUl) {
      if (!inUl) { out += '<ul>'; inUl = true }
      out += '<li>' + inlineMd(line.replace(/^[\-\*] /, '')) + '</li>'
      continue
    }
    if (isOl) {
      if (!inOl) { out += '<ol>'; inOl = true }
      out += '<li>' + inlineMd(line.replace(/^\d+\. /, '')) + '</li>'
      continue
    }
    if (line.trim() === '') { out += '<br>'; continue }
    out += '<p>' + inlineMd(line) + '</p>'
  }
  if (inUl) out += '</ul>'
  if (inOl) out += '</ol>'
  if (inTable) out += '</tbody></table>'

  blocks.forEach((html, i) => {
    out = out.replace('\x01' + i + '\x01', html)
  })
  return out
}
