ZSH=$HOME/.oh-my-zsh
ZSH_CUSTOM=$HOME/zsh_custom
ZSH_THEME="yurik"
DISABLE_AUTO_UPDATE="true"
DISABLE_LS_COLORS="true"

plugins=(git bundler brew gem)

export PATH="/usr/local/bin:$PATH"

source $ZSH/oh-my-zsh.sh

setopt hist_ignore_all_dups # don't store duplicates in history at all, even if they are *not* typed in a row (as opposed to hist_ignore_dups)
# setopt share_history
setopt hist_verify # don't run the command from history immediately, rather wait for another "enter" hit
# setopt inc_append_history
setopt extended_history
setopt hist_expire_dups_first

source $HOME/.aliases
source $HOME/.boot_actions

eval "$(fzf --zsh)"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

eval "$(direnv hook zsh)"

source $HOME/.secrets
export TRACK_ORCH_DECISION_ASSIGNEE_USER_ID="us_01M1GXPZKSQH8JKE5SCWJ30YGY"

# Added by codebase-memory-mcp install
export PATH="/Users/yuri/.local/bin:$PATH"
export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"

export PATH="$HOME/bin:$PATH"
