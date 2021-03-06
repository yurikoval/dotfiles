Sublime Text 2 Completions for RubyMotion
==========================================

This is a quick and dirty port of the completions generated by [RubyMotion.tmBundle](https://github.com/libin/RubyMotion.tmbundle). As such, I'm not sure if there are any missing methods or not, but feel free to contribute if you find some.

Installation
------------

Put this package into your Sublime Text 2 packages folder:

**Windows**: %APPDATA%\Sublime Text 2\Packages  
**OS X**: ~/Library/Application Support/Sublime Text 2/Packages  
**Linux**: ~/.Sublime Text 2/Packages

iOS 6.0 Support
---------------

Because iOS 6.0 is currently under a NDA you will have to generate the completions manually. To do this you will first need to update RubyMotion to support iOS 6.0 using the following commands in your OS X Terminal:

    cd /Library/RubyMotion/data/6.0; rake update

Now you can run the following command to regenerate the completions:

    ruby ~/Library/Application\ Support/Sublime\ Text\ 2/Packages/RubyMotion/Support/compile_completions.rb > ~/Library/Application\ Support/Sublime\ Text\ 2/Packages/RubyMotion/RubyMotion.sublime-completions

_Please note that I don't currently have access to the iOS 6 beta so if you run across any problems with the generations, please let me know_

Usage
-----

Inside your RubyMotion project just start typing the name of a method and the autocomplete window will pop up.  
Press enter/return to trigger the completion.

More Information
----------------
[SublimeText 2 Auto Complete Docs](http://www.sublimetext.com/docs/2/auto_complete.html)