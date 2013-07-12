ZSH=$HOME/.oh-my-zsh
ZSH_THEME="robbyrussell"
DISABLE_AUTO_UPDATE="true"
DISABLE_LS_COLORS="true"

plugins=(git bundler brew gem rbates)

export PATH="/usr/local/bin:$PATH"

source $ZSH/oh-my-zsh.sh

# for Homebrew installed rbenv
if which rbenv > /dev/null; then eval "$(rbenv init -)"; fi

setopt hist_ignore_all_dups # don't store duplicates in history at all, even if they are *not* typed in a row (as opposed to hist_ignore_dups)
# setopt share_history
setopt hist_verify # don't run the command from history immediately, rather wait for another "enter" hit
# setopt inc_append_history
setopt extended_history
setopt hist_expire_dups_first

. $HOME/.profile
