// The stored brief is a full email document. To show it inside a page, keep only what is inside <body>.
export function bodyOf(html: string): string {
  return html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
}
