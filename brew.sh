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
brew install ack \
  asdf \
  bat \
  cowsay \
  diff-so-fancy \
  fortune \
  fzf \
  gpg \
  gh \
  git \
  git-lfs \
  heroku \
  jq \
  lolcat \
  openssh \
  openssl \
  rename \
  stow \
  terraform \
  tldr \
  tree \
  webp \
  wget \
  z \
  zsh \
  zsh-autosuggestions

# Install casks
brew install --cask 1password
brew install --cask alfred
brew install --cask bartender
brew install --cask brave-browser
brew install --cask cyberduck
brew install --cask discord
brew install --cask divvy
brew install --cask dotnet-sdk
brew install --cask figma
brew install --cask google-chrome
brew install --cask google-cloud-sdk
brew install --cask hyper
brew install --cask imageoptim
brew install --cask iterm2
brew install --cask notion
brew install --cask obsidian
brew install --cask omnifocus
brew install --cask omnigraffle
brew install --cask omnioutliner
brew install --cask omniplan
brew install --cask menumeters
brew install --cask protonvpn protonmail-bridge proton-drive
brew install --cask quicksilver
brew install --cask skitch
brew install --cask signal
brew install --cask slack
brew install --cask spectacle
brew install --cask tower
brew install --cask visual-studio-code
brew install --cask whatsapp

# Install fzf
brew install fzf
$(brew --prefix)/opt/fzf/install

# Install oh-my-zsh
sh -c "$(wget -O- https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"

# Remove outdated versions from the cellar
brew cleanup
