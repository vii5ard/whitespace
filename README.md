# Whitelips IDE

Whitelips is an integrated development environment (IDE) for esoteric languages. 
It is based on the [Whitespace programming language](http://compsoc.dur.ac.uk/whitespace/) but can also be used for other
languages as well. Support for other languages can be added by using the existing languages to create new interpreters or
translators into the existing languages.

The latest online version can be found at http://vii5ard.github.io/whitespace/ . This project started as a joke, like the language
itself, and should not be taken too seriously (unless you want to contribute).


Whitelips features:
* Support for interpreters and compilers for other esoteric languages,
* Brainfuck interpeter and compiler (Whitespace implementation),
* Malbolge interpreter (Whitespace implementation),
* Whitespace virtual machine,
* Whitespace optimizer,
* On-the-fly compilation,
* Local storage (browser) for programs (programs are never sent to the server),
* Whitespace assembly virtual machine and compiler to Whitespace,
* Whitespace disassembler,
* Debugging Whitespace and assembly programs,
* Whitespace syntax highlight,
* Example programs (including a Brainfuck [interpreter](https://github.com/vii5ard/brainfuck-whitespace)).
* Whitespace assembly macros,
* Whitespace assembly libraries:
  - lib/alias.ws - Aliases for compatibility with other assemby implementations.
  - lib/math.ws - Math functions (e.g. sqrt) .
  - lib/rot13.ws - rot13.
  - lib/std.ws - Includes all the libraries.
  - lib/string.ws - Some useful string functions.

