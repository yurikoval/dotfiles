## Start MacPorts stuff
export PATH=/opt/local/bin:/opt/local/sbin:$PATH
export MANPATH=/opt/local/share/man:$MANPATH
export QTDIR=/opt/local/lib/qt3
## END MacPorts stuff

# Add local gems bin directory and set GEM_HOME
export PATH=~/.gem/ruby/1.8/bin:$PATH
export GEM_HOME=~/.gem/ruby/1.8
export GEM_PATH=~/.gem/ruby/1.8

# rails stuff
PATH=$PATH:$HOME/.rvm/bin
#rvm use ruby-1.8.7-p330

# Add user path
export PATH=$PATH:~/bin:~/Documents/bin:~/dotfiles/bin

export LANG=en_US.UTF-8

alias dus='du -Pscxm * | sort -nr'

alias lah='ls -lah'

#export VISUAL='~/bin/mate --wait'
#export VISUAL='/bin/subl --wait'
export EDITOR=/usr/bin/vim

# bundle exec
alias be='bundle exec'
alias brake='bundle exec rake'
alias cap='bundle exec cap'

alias db_migrate='brake db:migrate RAILS_ENV=test && brake db:migrate'
alias db_rollback='brake db:rollback RAILS_ENV=test && brake db:rollback'

# Git stuff
alias g='git'
alias gf='git flow'

# tmux stuff
# sessions
alias tsa='tmux attach -t'
alias tsd='tmux detach'
alias tsl='tmux list-sessions'
alias tsn='tmux new -s'
alias tss='tmux switch -t'
# windows
alias twn='tmux new-window'
alias tws='tmux select-window -t'
alias twr='tmux rename-window'
# panes
alias tpv='tmux split-window'
alias tph='tmux split-window -h'
alias tpsw='tmux swap-pane'
alias tps='tmux select-pane'
alias tpsn='tmux select-pane -t :.+'
# Helpful
alias tlk='tmux list-keys'
alias tlc='tmux list-commands'
alias ti='tmux info'
alias trl='tmux source-file ~/.tmux.conf'

#custom aliases
alias r='rails'
alias rs='rails server'
alias g='git'
alias gs='git status'
alias ga='git add -p'
alias gg='git lol'
alias gga='git lola'
alias gf='git fetch'
alias co='git checkout'
alias br='git branch'
alias bra='git branch --all'
alias be='bundle exec'
alias beg='bundle exec guard start'
alias b='bundle'
alias ber='bundle exec rspec'
alias gc='commit_helper'
alias z='zeus'
alias zr='zeus rspec'
alias ra='rake'
alias rmr='rake nibs:clean && rake resources'
alias rmib='rake ib:project && cp ib.xcodeproj/Stubs.h xcode/sekken/sekken/'
alias cal='DEVICE=ipad rake calabash:run'
alias fs='foreman start'

# DEV environment
if [ -f ~/.profile_local ]; then
  . ~/.profile_local
fi
if [[ -z "$DEVPATH" ]]; then
  export DEVPATH="/WORKING/WEBDEV"
fi
alias dev='cd $DEVPATH; echo "Moved to dev."'

# Show RVM status in prompt
# export PROMPT_COMMAND='echo -n ">>> "; echo -n $GEM_HOME | sed -e "s/.*\///" | tr -d "\012" ; git branch --no-color 2> /dev/null | sed -e "/^[^*]/d" -e "s/* \(.*\)/ (\1)/" | tr -d "\012" ; echo " <<<"'

#. ~/.cli_separators

# Add texbin to the PATH
export PATH=$PATH:/usr/texbin

# Load RVM
#[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*

# Enable bash completion
if [ -f /opt/local/etc/bash_completion ]; then
    . /opt/local/etc/bash_completion
fi
source ~/.rvm/scripts/rvm
dev
cowsay `fortune` | lolcat
