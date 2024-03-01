#!/usr/bin/env bash

# Install command-line tools using Homebrew

# Ask for the administrator password upfront
sudo -v

# Keep-alive: update existing `sudo` time stamp until the script has finished
while true; do sudo -n true; sleep 60; kill -0 "$$" || exit; done 2>/dev/null &

# Update and upgrade already-installed formulae
brew update
brew upgrade

# Add taps
brew tap heroku/brew

# Install binaries
brew install ack
brew install bat
brew install cowsay
brew install diff-so-fancy
brew install fortune
brew install gpg
brew install gh
brew install git
brew install git-lfs
brew install heroku
brew install lolcat
brew install openssh
brew install openssl
brew install rename
brew install stow
brew install tldr
brew install tree
brew install webp
brew install wget
brew install zsh
brew install zsh-autosuggestions

# Install casks
brew install --cask 1password
brew install --cask alfred
brew install --cask bartender
brew install --cask brave
brew install --cask divvy
brew install --cask dotnet-sdk
brew install --cask google-chrome
brew install --cask hyper
brew install --cask iterm2
brew install --cask menumeters
brew install --cask quicksilver
brew install --cask slack
brew install --cask spectacle
brew install --cask tower
brew install --cask visual-studio-code

# Install fzf
brew install fzf
$(brew --prefix)/opt/fzf/install

# Install oh-my-zsh
sh -c "$(wget -O- https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"

# Remove outdated versions from the cellar
brew cleanup
