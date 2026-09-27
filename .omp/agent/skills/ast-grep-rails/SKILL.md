---
name: ast-grep-rails
description: Verified ast_grep patterns and gotchas for Ruby on Rails and React/TypeScript code (associations, callbacks, controllers, hooks, JSX, imports)
---
# ast_grep on Rails + React

Every pattern below was run against a Rails 8 / React 19 monolith and matched. Scope calls to `app/` (or narrower) and one language per call; `.erb`, `.yml`, `.json` are not parsed — use `grep`.

## Rules of the grammar

- `$NAME` = one whole AST node. `$$$ARGS` = zero or more. Names UPPERCASE. `$$NAME` is invalid.
- A metavariable is never a token fragment. Ruby `has_many :$NAME` matches nothing (symbol is one token) — write `has_many $NAME` and read the symbol from `meta:`. TSX string arguments do capture: `t("$K")` works.
- The pattern must parse as one complete node in the target language. `def $M($$$P) $$$B end` is complete; a bare `dependent: $D` is not (wrap it in the call).
- Receiver matters. `find_by($$$A)` matches only receiverless calls (1 hit); `$X.find_by($$$A)` matches `User.find_by(...)` (173 hits). Chains: `$X.where($$$A)`.
- Ruby `do … end` and `{ … }` blocks are different nodes; query both when either form is plausible.
- Same metavariable twice must match identical code: `$A == $A`.

## Ruby / Rails

| Question | Pattern |
|---|---|
| associations | `has_many $$$ARGS` · `belongs_to $$$ARGS` · `has_many $NAME, dependent: $D` |
| validations / callbacks | `validates $$$ARGS` · `after_commit $$$A` · `before_action $$$ARGS` |
| scopes | `scope $NAME, $LAMBDA` |
| controller responses | `render json: $$$ARGS` |
| writes | `$OBJ.update!($$$ARGS)` · `$X.where($$$A)` · `$X.find_by($$$A)` |
| method definitions | `def $M($$$P) $$$B end` (no-paren defs need `def $M $$$B end`) |
| logging | `Rails.logger.$LEVEL($$$A)` |
| feature flags | `Feature.enabled?($$$A)` |
| iteration | `$X.each do \|$I\| $$$B end` · `$X.each { \|$I\| $$$B }` |

## React / TypeScript (`tsx` for components, `typescript` for plain modules)

| Question | Pattern |
|---|---|
| effects | `useEffect($$$A)` · `useEffect(() => { $$$B }, [$$$D])` · empty deps only: `useEffect(() => { $$$B }, [])` |
| state | `useState($I)` · `useState<$T>($I)` |
| Inertia | `usePage<$T>()` · `useForm($$$A)` · `router.$M($$$A)` |
| i18n | `useTranslation($$$A)` · `t("$K")` |
| components | `export default function $N($$$P) { $$$B }` · `export function $N($$$P) { $$$B }` · `const $N = ($$$P) => { $$$B }` |
| JSX | `<$C $$$P />` (self-closing only) · `<Button $$$P>$$$K</Button>` (paired) |
| imports / exports | `import { $$$I } from "$M"` · `export const $N = $V` |
| network / debug | `fetch($$$A)` · `console.log($$$A)` |

## Workflow

1. Scope tight (`app/models`, `app/javascript/pages/talk`) — output caps at 50 matches; a broad `<$C $$$P />` over `app/javascript` returns thousands.
2. Read `meta:` lines instead of opening files when the capture answers the question.
3. Rewrite with `ast_edit` using the same `pat` and an `out` template that reuses the captures; resolve or reject the staged proposal explicitly.
