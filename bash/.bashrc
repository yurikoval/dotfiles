source $HOME/.aliases
source $HOME/.boot_actions

# Enable bash completion
if [ -f /opt/local/etc/bash_completion ]; then
    . /opt/local/etc/bash_completion
fi

# enable fuzzy search
[ -f ~/.fzf.bash ] && source ~/.fzf.bash