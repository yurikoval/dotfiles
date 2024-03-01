# dotfiles

## setup

First we'll need to install [brew](http://brew.sh/):

```
ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
```

## installation

All installation is done via the `install.sh` script. Comment/uncomment the sections relevant to you:

```
cd ~
git clone https://github.com/yurikoval/dotfiles.git
cd dotfiles
source install.sh
```

To install specific configs, you can use the `stow` command with the folder name as the only argument.

To install the *zsh* configs:

```
stow zsh
```

This will symlink everything in `~/dotfiles/zsh` to the correct place in `$HOME`.
