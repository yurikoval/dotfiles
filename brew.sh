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
brew tap anomalyco/tap
brew tap heroku/brew
brew tap knative-extensions/kn-plugins

# Install binaries
brew install ack \
  asdf \
  bat \
  cmake \
  cocoapods \
  colima \
  coreutils \
  cowsay \
  diff-so-fancy \
  dnsx \
  docker \
  ffmpeg \
  flyctl \
  fortune \
  fzf \
  gemini-cli \
  gh \
  git-fixup \
  git-lfs \
  heroku \
  jq \
  k3d \
  kind \
  lolcat \
  nmap \
  anomalyco/tap/opencode \
  openssh \
  parallel \
  peco \
  rename \
  stow \
  subfinder \
  subversion \
  terraform \
  tldr \
  transmission-cli \
  tree \
  watch \
  wget \
  wp-cli \
  youtube-dl \
  yt-dlp \
  z \
  zsh \
  zsh-autosuggestions \
  knative-extensions/kn-plugins/func \
  knative-extensions/kn-plugins/quickstart

# Install casks
brew install --cask 1password
brew install --cask airflow
brew install --cask alfred
brew install --cask antigravity
brew install --cask arc
brew install --cask bartender
brew install --cask blackhole-16ch
brew install --cask brave-browser
brew install --cask caffeine
brew install --cask chatgpt
brew install --cask chromium
brew install --cask claude
brew install --cask claude-code
brew install --cask cyberduck
brew install --cask discord
brew install --cask divvy
brew install --cask dotnet-sdk
brew install --cask figma
brew install --cask gcloud-cli
brew install --cask google-chrome
brew install --cask gpt4all
brew install --cask hyper
brew install --cask imageoptim
brew install --cask iterm2
brew install --cask jan
brew install --cask macdown
brew install --cask menumeters
brew install --cask mountain-duck
brew install --cask notion
brew install --cask obsidian
brew install --cask omnifocus
brew install --cask omnioutliner
brew install --cask omniplan
brew install --cask openaudible
brew install --cask opera
brew install --cask proton-drive
brew install --cask proton-mail-bridge
brew install --cask protonvpn
brew install --cask quicksilver
brew install --cask signal
brew install --cask skitch
brew install --cask slack
brew install --cask sonos
brew install --cask spectacle
brew install --cask spotify
brew install --cask telegram
brew install --cask tor-browser
brew install --cask tower
brew install --cask transmission
brew install --cask typora
brew install --cask vlc
brew install --cask whatsapp
brew install --cask xscope

# Configure fzf key bindings and fuzzy completion
$(brew --prefix)/opt/fzf/install

# Install oh-my-zsh
sh -c "$(wget -O- https://raw.githubusercontent.com/robbyrussell/oh-my-zsh/master/tools/install.sh)"

# Remove outdated versions from the cellar
brew cleanup
