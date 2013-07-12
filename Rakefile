require 'rake'
require 'erb'

desc "install the dot files into user's home directory"
task :install do
  install_oh_my_zsh
  switch_to_zsh
  replace_all = false
  files = Dir.entries('preferences/') - files_to_link.map{|a| a[:original]} - ['.DS_Store']
  files = files.reject{|file| file =~ /^\.+$/ }.map{|file| "preferences/#{file}"}
  files << "oh-my-zsh/custom/plugins/rbates"
  files << "oh-my-zsh/custom/rbates.zsh-theme"
  files.each do |file|
    original = file
    copy_to = file.sub(/^preferences\//, '')
    system %Q{mkdir -p "$HOME/#{File.dirname(copy_to)}"} if copy_to =~ /\//
    if File.exist?(File.join(ENV['HOME'], "#{copy_to.sub(/\.erb$/, '')}"))
      if File.identical? copy_to, File.join(ENV['HOME'], "#{copy_to.sub(/\.erb$/, '')}")
        puts "identical ~/#{copy_to.sub(/\.erb$/, '')}"
      elsif replace_all
        replace_file(copy_to)
      else
        print "overwrite ~/#{copy_to.sub(/\.erb$/, '')}? [ynaq] "
        case $stdin.gets.chomp
        when 'a'
          replace_all = true
          replace_file(copy_to)
        when 'y'
          replace_file(copy_to)
        when 'q'
          exit
        else
          puts "skipping ~/#{copy_to.sub(/\.erb$/, '')}"
        end
      end
    else
      link_file(original, copy_to)
    end
  end

  # link excluded files in files_to_link
  files_to_link.each do |file|
    system %Q{mkdir -p "$HOME/#{File.dirname(file[:link_to_dir])}"}
    link_file("preferences/#{file[:original]}", "#{file[:link_to_dir]}/#{file[:original]}")
  end
end

def files_to_link
  [
    {original: 'Packages', link_to_dir: "Library/Application Support/Sublime Text 2"},
  ]
end

def replace_file(file)
  system %Q{rm -rf "$HOME/#{file.sub(/\.erb$/, '')}"}
  link_file(file)
end

def link_file(file, to = "")
  if file =~ /.erb$/
    puts "generating ~/#{file.sub(/\.erb$/, '')}"
    File.open(File.join(ENV['HOME'], "#{file.sub(/\.erb$/, '')}"), 'w') do |new_file|
      new_file.write ERB.new(File.read(file)).result(binding)
    end
  elsif file =~ /zshrc$/ # copy zshrc instead of link
    puts "copying ~/#{file}"
    system %Q{cp "$PWD/#{file}" "$HOME/#{to}"}
  else
    puts "linking ~/#{file} to $HOME/#{to}"
    system %Q{ln -s "$PWD/#{file}" "$HOME/#{to}"}
  end
end

def switch_to_zsh
  if ENV["SHELL"] =~ /zsh/
    puts "using zsh"
  else
    print "switch to zsh? (recommended) [ynq] "
    case $stdin.gets.chomp
    when 'y'
      puts "switching to zsh"
      system %Q{chsh -s `which zsh`}
    when 'q'
      exit
    else
      puts "skipping zsh"
    end
  end
end

def install_oh_my_zsh
  if File.exist?(File.join(ENV['HOME'], ".oh-my-zsh"))
    puts "found ~/.oh-my-zsh"
  else
    print "install oh-my-zsh? [ynq] "
    case $stdin.gets.chomp
    when 'y'
      puts "installing oh-my-zsh"
      system %Q{git clone https://github.com/robbyrussell/oh-my-zsh.git "$HOME/.oh-my-zsh"}
    when 'q'
      exit
    else
      puts "skipping oh-my-zsh, you will need to change ~/.zshrc"
    end
  end
end
