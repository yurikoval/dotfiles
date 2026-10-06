# Oh My Zsh
ZSH=$HOME/.oh-my-zsh
ZSH_CUSTOM=$HOME/zsh_custom
ZSH_THEME="yurik"
DISABLE_AUTO_UPDATE="true"
DISABLE_LS_COLORS="true"

plugins=(git bundler brew gem)

source $ZSH/oh-my-zsh.sh

# History
setopt hist_ignore_all_dups # don't store duplicates in history at all, even if they are *not* typed in a row (as opposed to hist_ignore_dups)
# setopt share_history
setopt hist_verify # don't run the command from history immediately, rather wait for another "enter" hit
# setopt inc_append_history
setopt extended_history
setopt hist_expire_dups_first

# Shared shell setup
source $HOME/.aliases
source $HOME/.boot_actions

# Zsh integrations
eval "$(fzf --zsh)"
eval "$(direnv hook zsh)"

# Private environment
source "${${(%):-%N}:A:h}/.secrets"
