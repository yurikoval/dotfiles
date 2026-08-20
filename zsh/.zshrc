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

# Added by Antigravity
export PATH="/Users/yuri/.antigravity/antigravity/bin:$PATH"

# add Pulumi to the PATH
export PATH=$PATH:/Users/yuri/.pulumi/bin

# Added by LM Studio CLI (lms)
export PATH="$PATH:/Users/yuri/.lmstudio/bin"
# End of LM Studio CLI section

eval "$(direnv hook zsh)"

export BRAVE_API_KEY="$(security find-generic-password -s brave-api-key -w)"
export ELEVENLABS_API_KEY="$(security find-generic-password -s elevenlabs-api-key -w)"
export SCRAPECREATORS_API_KEY="$(security find-generic-password -s scrape-creators-key -w)"
export OPENROUTER_API_KEY="$(security find-generic-password -s open-router-key -w)"
export DRPC_API_KEY="$(security find-generic-password -s drpc-org-key -w)"

# Added by codebase-memory-mcp install
export PATH="/Users/yuri/.local/bin:$PATH"
