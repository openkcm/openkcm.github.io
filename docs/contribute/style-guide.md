# Documentation Style Guide

This style guide outlines the standards for writing and formatting documents for
the OpenKCM.

## Target audience

Markdown is basically a structured language similar to source code, it will be
consumed in rendered form. There is no unified Markdown specification, so
different renderers will show it in different way.

User-facing documentation will be rendered by `mkdocs` (with the Material theme)
to static HTML files. `mkdocs` provides several enhancements compared to other
solutions, such as warning boxes.

You can install `mkdocs` with the Material theme to your workstation using `pip`
and render the page locally to see the result. Do not assume, that your document
will look OK via `mkdocs`, based on its appearance in GitHub, Gitlab, or in VS
Code's preview!

## Document layout

In general, Markdown source documents benefit from some variation of the
following layout:

```markdown
# Document Title

Short introduction.

[TOC]

## Topic

Content.

## See also

- https://link.to/more-info
```

1. `# Document title`: The first heading should be a H1 heading, ideally the
   same or nearly the same as the filename. The first H1 heading is used as the
   page `<title>`.
1. `Short introduction`. 1–3 sentences providing a high-level overview of the
   topic. Imagine yourself as a complete newbie who landed on your “Extending
   Foo” doc and doesn’t know the most basic information you take for granted.
   “What is Foo? Why would I extend it?”
1. `[TOC]`: if you use hosting that supports table of contents, such as GitHub
   or Gitlab put `[TOC]` after the short introduction. If renderers support
   creating automatic TOCs, do not place a `TOC` directive.
1. `## Topic`: The rest of your headings should start from H2.
1. `## See also`: Put miscellaneous links at the bottom for the user who wants
   to know more or didn’t find what they needed.

## Table of contents

`mkdocs` generates a static `TOC` from the sub-page based on the headers found
in the page during generation. Do not include any sort of `TOC` to the
user-facing documentation.

## Line length

Markdown can be considered source code, which is written, re-written, edited
continuously, and compiled into its final HTML form.

To simplify the editing and review process the line length should be kept short.
Consider starting a sentence in a newline after a comma, after an "and", when
the sentence naturally breaks.

Try to write short sentences. Keep in mind a ca. 80, max. 120 character line
length limit. If the sentence is too long, apply the rules from above.

## Headers

Use headers only for real headers, not for making the text more visible. For
that purpose use **bold** or _italics_. Use a single H1 heading in a Markdown
source document; subsequent headings should be H2 or deeper.

Use header levels consecutively, don't skip them:

```markdown
# level1

## level 2

### level 3
```

Not:

```markdown
# level1

### level 3
```

Header text has to be unique in the whole Markdown source document. It is
important, because HTML IDs are created from the headers which are then used as
links to the specific section in the document (such as the `TOC`). Duplicated
headers will break this functionality, and a link to a specific section can be
rendered as a link to another section with the same header text. This includes
headers in different sub-sections.

BAD example:

```markdown
# My bad docs site

## Foo

### Summary

### Examples

## Bar

### Summary

### Examples
```

GOOD example:

```markdown
# My good docs site

## Foo

### Foo Summary

### Foo Examples

## Bar

### Bar Summary

### Bar Examples
```

### Header case

There are several approaches, our approach is `First word with uppercase`. You
can see this applied in this document.

### Header numbering

Do not number the headers. This will just introduce headaches during editing, as
adding or removing sections will necessitate manual renumbering.

If documenting sequential tasks, consider numbered lists instead.

### Header spacing

Prefer an empty line break between a header and its content text. This increases
readability. For example:

```markdown
Some text before heading.

## Level 2

Text after the heading.
```

## Lists

### Numbered lists

Numbered lists can be tricky as the renderers usually ignore the manually added
numbers and number the list automatically. The automatic numbering is sensitive
and can restart the numbering. The exact rules of preventing this can be
different for different renderers.

When adding numbered lists, let the renderer decide how to display them and just
stick to the definition for numbered lists, which is to use `1.` for any item in
the same numbered list.

```markdown
1. first item
1. second item
1. third item
```

### Bulleted lists

Bulleted (or unordered lists) should use a `-` as the identifier for an item in
a bulleted list. For example:

```markdown
DO NOT DO THIS

* not a good item
* this is also not a good item

DO THIS

- this is a good item
- this is another good item
```

### Indentation

Use 4-space indentation for lists, this includes ordered and unordered lists as
well. For example:

```markdown
1. this sentence has 1 space between the number and the content the next
   sentence is wrapped and continues here
1. finally the third sentence is again 4-space indented
    1. a sub item uses again 4-space indentation
    1. and the iem below as well
1. and we are back to the original level
```

Consistently, the same indentation and spacing rules are applied to unordered
lists. For example:

```markdown
- my bulleted item
- another item
    - with a sub item consistently indented
    - and another one
- and back to original level
```

### Nested lists

When nesting lists, the same rules explained before are applied. Use a
consistent 4-space indent for both numbered and bulleted items:

```markdown
1. Use 1 space after the item number, so the text itself is indented 3 spaces.
   Use a 3-space indent for wrapped text.
2. Use 1 space again for the next item.

- Use 1 space after a bullet, so the text itself is indented 2 spaces. Use a
  3-space indent for wrapped text.

    1. Use 1 space with numbered lists, as before. Wrapped text in a nested list
       needs an 7-space indent.
    2. Looks nice, doesn't it?

- Back to the bulleted list, indented 1 space.
```

## Text highlighting

There are two possibilities:

- One asterisk for _italics, or slanted text_: `*italics*`. This is usually
  recommended for emphasizing text.
- Two asterisks for **bold text**: `**bold**`. This is more visible.
- Do not use the backtick style for highlighting parts of the text.

To write monospace texts:

- Backticked (\`) `ConfigurationParameter`. Use only for words, phrases lifted
  from a source code or configuration file.
- Fenced code (with \`\`\`) — only for code or configuration snippets. Syntax
  should be hinted.

!!! note

    Each code block has to have its language specified. For plaintexts or stdouts,
    use text. For usage refer to official documentation.

To write a block quote, prepend the line with `>`:

> This is a block quote. You can use it to highlight a paragraph.

`mkdocs` with the Material theme supports [admonitions][admonitions] for
structuring pages.

[admonitions]:
    https://squidfunk.github.io/mkdocs-material/reference/admonitions/#usage

## Links

Long links make source Markdown difficult to read and break the 80 character
wrapping. **Wherever possible, shorten your links.**

### Use explicit paths for links within markdown

Use the explicit path for a markdown link in the same documentation project. For
example:

```markdown
[my example link](/path/to/markdown.md)
```

Avoid using the full qualifier URL:

```markdown
[my bad example link](https://full-url.bad-example.com/path/to/markdown.md)
```

### Avoid relative paths unless in the same directory

Relative paths are safe to use in the same directory. For example:

```markdown
[my link](other-page-in-same-dir.md)

[my other link](/path/to/another/dir/other-page.md)
```

Avoid relative links if you need to specify other directories with `../`:

```markdown
[my bad relative link](../bad/path/to/another/dir/other-page.md)
```

### Use natural and informative link titles

Markdown link syntax allows you to set a link title. Use it wisely. Users often
do not read documents word-by-word; they scan them.

Links catch the eye. But titling your links “here,” “link,” or simply
duplicating the target URL tells the reader precisely nothing and is a waste of
space:

```text
DO NOT DO THIS.

See the Markdown guide for more info: [link](markdown.md), or check out the style guide [here](/styleguide/docguide/style.html).

Check out a typical test result: [https://example.com/foo/bar](https://example.com/foo/bar).
```

Instead, write the sentence naturally, then go back and wrap the most
appropriate phrase with the link:

```text
See the [Markdown guide](markdown.md) for more info, or check out the [style guide](/styleguide/docguide/style.html).

Check out a [typical test result](https://example.com/foo/bar).
```

### References

Use reference-style links sparingly. Use them where the length of the link would
detract from readability of the source Markdown file. For example:

```markdown
See more in the [documentation][doku].

[doku]:
    http://example.com/doku/this/is/a/really/long/link/who/would/have/thought/man/when/does/it/actually/stop.md
```

Use reference links more often in tables. It is particularly important to keep
table content short, since Markdown does not provide a facility to break text in
cell tables across multiple lines, and smaller tables are more readable.
Multiple lines, and smaller tables are more readable.

For example, this table’s readability is worsened by inline links:

```markdown
DO NOT DO THIS.

| Site                                                             | Description             |
| ---------------------------------------------------------------- | ----------------------- |
| [site 1](http://github.com/excessively/long/path/example_site_1) | This is example site 1. |
| [site 2](http://github.com/excessively/long/path/example_site_2) | This is example site 2. |
```

Instead, use reference-style links to shorten the content of the table cells:

```markdown
| Site     | Description             |
| -------- | ----------------------- |
| [site 1] | This is example site 1. |
| [site 2] | This is example site 2. |

[site 1]: http://github.com/excessively/long/path/example_site_1
[site 2]: http://github.com/excessively/long/path/example_site_2
```

Reference-style links can also help with deduplication, when links to the same
resources are used more than once in the same Markdown source document.

The definition of a reference-style link should be at the bottom of the
sub-section where it is first used. For example:

```markdown
# Header

Some text with a [link][link_def].

Some more text with the same [link][link_def].

[link_def]: http://reallyreallyreallylonglink.com

## Header 2

... lots of text ...

## Header 3

Some more text using a [different_link][different_link_def].

[different_link_def]: http://differentreallyreallylonglink.com
```

## Diagrams

Diagrams are a well-suited tool to transport complex behavior or relationships
in a digestible manner. To work with diagrams in an effective way the
style-guide defines some guidelines for diagrams.

There are different tools which implement diagram drawing, the most popular ones
are:

- [draw.io](https://draw.io)
- [excalidraw](https://excalidraw.com)
- [mermaid.js](https://mermaid.js.org)

In general, the chosen tool is not as important. The source diagram should be
stored in the same repository. When the chosen tool supports tabs, such usage
should be limited to 1 tab per file. This is to make sure there are no hidden
diagrams that renderers cannot properly visualize.

Most tools support storing a diagram in some image format. The diagram should be
stored in PNG format to support layers and transparency. The diagram image
requires the filename suffix `.diagram.png`.

## Emoji

How Emoji is displayed depends on the specific Markdown renderer software so to
make sure the document looks the same, you shouldn't use them.

Instead of emojis you can use [UTF symbols][utfsymbols].

## Screenshots

Screenshots should be inserted with care as they tend to be outdated quickly.

Be careful to not leave sensitive information on the screenshots. Blur or black
them out if there's no possibility to leave them out.

Try to use light mode when creating screenshots, they look better on the white
pages of the documentation.

Try to shrink the window as much as possible, no point of including empty parts
of web interfaces.

## Folder and File naming convention

Files and folder names will be ideally simple without whitespace characters.
Complex names created from multiple words can use `-` instead of space.

BAD complex name:

```text
brokering and poollet behavior.md
```

GOOD complex name:

```text
brokering-and-poollet-behavior.md
```

## Miscellaneous

- Use a spell checker (example for [VS Code][codespell] and [VIM][vimspell]).
- Use a Markdown linter plugin for your editor.

This style guide was inspired by experience and
[the official google documentation style guide](https://google.github.io/styleguide/docguide/style.html).

[codespell]:
    https://marketplace.visualstudio.com/items?itemName=streetsidesoftware.code-spell-checker
[vimspell]: https://www.linux.com/training-tutorials/using-spell-checking-vim/
[utfsymbols]: https://www.w3schools.com/charsets/ref_utf_symbols.asp
