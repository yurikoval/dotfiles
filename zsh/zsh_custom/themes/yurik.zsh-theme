# ───────────────────────────────────────────────
# Generate a color from folder name (hash → 0–255)
# ───────────────────────────────────────────────
hashcolor() {
  local dir="$1"
  local hash=$(echo -n "$dir" | cksum | awk '{print $1}')
  echo $((hash % 215 + 16))   # stay in 16–231 for nice colors
}

# ───────────────────────────────────────────────
# Draw dynamic top border
# ───────────────────────────────────────────────
draw_border() {
  local dir="${PWD}"
  local color=$(hashcolor "$dir")
  local term_width=$(tput cols)

  # Build colored line of unicode box characters
  local line=$(printf '─%.0s' $(seq 1 $((term_width - 0))))
  print -P "%F{$color}$line%f"
}

# Call before each prompt
precmd_functions+=(draw_border)

# ───────────────────────────────────────────────
# Set a simple prompt below the border
# ───────────────────────────────────────────────

PROMPT='%{$fg[red]%}%{$fg[green]%}%p %{$fg[green]%}%c%{$fg_bold[blue]%}$(git_prompt_info)%{$fg[yellow]%} > %{$reset_color%}'

ZSH_THEME_GIT_PROMPT_PREFIX="("
ZSH_THEME_GIT_PROMPT_SUFFIX=")"
ZSH_THEME_GIT_PROMPT_DIRTY=""
ZSH_THEME_GIT_PROMPT_CLEAN=""

RPROMPT='$(git_prompt_status)%{$reset_color%}'

ZSH_THEME_GIT_PROMPT_ADDED="%{$fg[cyan]%} ✈"
ZSH_THEME_GIT_PROMPT_MODIFIED="%{$fg[yellow]%} ✭"
ZSH_THEME_GIT_PROMPT_DELETED="%{$fg[red]%} ✗"
ZSH_THEME_GIT_PROMPT_RENAMED="%{$fg[blue]%} ➦"
ZSH_THEME_GIT_PROMPT_UNMERGED="%{$fg[magenta]%} ✂"
ZSH_THEME_GIT_PROMPT_UNTRACKED="%{$fg[grey]%} ✱"
