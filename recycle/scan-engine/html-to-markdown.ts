// Regex-based HTML→Markdown converter. Pure, no DOM.
export function htmlToMarkdown(html: string): string {
  let md = html;

  // Strip non-content blocks
  md = md.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // Headings
  md = md.replace(/<h1[^>]*>([^<]+)<\/h1>/gi, '\n# $1\n\n');
  md = md.replace(/<h2[^>]*>([^<]+)<\/h2>/gi, '\n## $1\n\n');
  md = md.replace(/<h3[^>]*>([^<]+)<\/h3>/gi, '\n### $1\n\n');
  md = md.replace(/<h4[^>]*>([^<]+)<\/h4>/gi, '\n#### $1\n\n');
  md = md.replace(/<h5[^>]*>([^<]+)<\/h5>/gi, '\n##### $1\n\n');
  md = md.replace(/<h6[^>]*>([^<]+)<\/h6>/gi, '\n###### $1\n\n');

  // Links & images
  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi, '[$2]($1)');
  md = md.replace(/<a[^>]*href=["']([^"']+)["'][^>]*\/?>/gi, '[$1]($1)');
  md = md.replace(/<img[^>]*alt=["']([^"']+)["'][^>]*src=["']([^"']+)["'][^>]*>/gi, '![$1]($2)');
  md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']+)["'][^>]*>/gi, '![$2]($1)');
  md = md.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, '![]($1)');

  // Emphasis
  md = md.replace(/<strong[^>]*>([^<]+)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([^<]+)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([^<]+)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>([^<]+)<\/i>/gi, '*$1*');

  // Code
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
  md = md.replace(/<code[^>]*>([^<]+)<\/code>/gi, '`$1`');

  // Blocks
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, '> $1\n\n');
  md = md.replace(/<ul[^>]*>/gi, '\n').replace(/<\/ul>/gi, '\n');
  md = md.replace(/<ol[^>]*>/gi, '\n').replace(/<\/ol>/gi, '\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
  md = md.replace(/<br[^>]*\/?>/gi, '\n');
  md = md.replace(/<hr[^>]*\/?>/gi, '\n---\n');

  // Strip remaining tags & decode entities
  md = md.replace(/<[^>]+>/g, '');
  md = md
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  return md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
}
