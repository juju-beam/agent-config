---
name: structural-search
description: Which of lsp, ast_grep, grep to use for a code question in Ruby/Rails/TypeScript/React, and the blind spots of ruby-lsp and ast-grep on this stack. Read before the first code search.
---
Choose the search tool by the kind of question, not by habit:

- Symbol question (where is X defined, who calls X, rename X) → `lsp` (`definition`, `references`, `rename`). Never grep for callers when a server is up.
- Shape question (every `has_many … dependent:`, every `useEffect` with an empty deps array, every call of a method by form) → `ast_grep` when you have it. One structural query replaces a grep plus several reads.
- Text question (strings, comments, i18n keys, YAML/ERB/config, log lines) → `grep`.
- Codemod (same rewrite at many sites) → `ast_edit`, never sed or a loop of edits.

Hard facts for this stack: ast-grep does not parse `.erb` or `.yml` — grep those. ruby-lsp does not index `spec/` and does not count symbol-form uses (`after_commit :x`, `before_action :x`, `scope :x`) as references, so `references` on a callback or scope name returns only its `def`; use `ast_grep`/`grep` for those and for spec callers. Pattern crib: `read skill://ast-grep-rails`.
