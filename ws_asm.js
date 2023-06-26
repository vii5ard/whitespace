globalThis.ws_asm  = (function() {
  const builtinMacros = function () {
    return {
      "include": {
        params: ["STRING"],
        action: function (args, builder) {
          const arg = args[1];

          let fileName = arg.token;
          fileName = fileName.slice(1, fileName.length - 1);
          if (!(fileName in builder.includes)) {
            const file = ws_fs.getFile(fileName);
            if (!file) {
              throw `File not found: '${fileName}'`;
            }

            builder.includes[fileName] = ws_fs.openFile(file);

            if (builder.includes[fileName]) {
              const srcArr = ws_util.StrArr(builder.includes[fileName]);
              try {
                const ext = ws_asm.compile(builder.includes[fileName], builder);
                builder.externals.push(ext);
              } catch (err) {
                if (err.program) {
                  builder.externals.push(err.program);
                  console.warn(`Broken include '${fileName}': ${err.message}`);
                } else {
                  throw `Error while compiling '${fileName}': ${err.message}`;
                }
              }
            }
          }
        }
      },
      "macro": {
        params: ["LABEL"],
        action: function (args, builder) {
          const metaTypes = {"$number": "NUMBER", "$label": "TOKEN", "$string": "STRING"};
          const macroLabel = args[1].token;
          let closed = false;

          const newMacro = {
            tokens: [],
            params: [],
            action: function (args, builder) {
              builder.macroCallCounter = (builder.macroCallCounter || 0) + 1;
              const macroId = builder.macroCallCounter;
              args[0].called = (args[0].called || 0) + 1
              if (args[0].called > 16) {
                throw "Circular reference of macros";
              }

              const toks = [];
              let pp = 1;
              for (const t of this.tokens) {
                const token = Object.assign({}, t);
                if (token.token in metaTypes) {
                  toks.push(args[pp++]);
                } else {
                  if (/^\$\d+$/.test(token.token)) {
                    token.token = ".__" + macroId + "__" + token.token + "__";
                  }
                  toks.push(token);
                }
              }

              builder.tokens = toks.concat(builder.tokens);
            }
          };
          while (true) {
            const token = builder.tokens.shift();
            if (!token) {
              break;
            }
            if (token.type === "MACRO") {
              if (token.token === "$$") {
                closed = true;
                break;
              }
              if (token.token === "include") {
                // do nothing
              } else if (token.token === "$redef") {
                args[1].type = "MACRO";
                newMacro.tokens.push(args[1]);
                continue;
              } else if (token.token in metaTypes) {
                newMacro.params.push(metaTypes[token.token]);
              }
            }
            newMacro.tokens.push(token);
          }
          if (!closed) {
            throw "Macro not closed";
          }

          builder.macros[macroLabel] = newMacro;
        }
      },
      "$$": {
        params: [],
        action: function (args, builder) {
          throw "Unexpected end of macro";
        }
      },
      "$label": {
        params: [],
        action: function (args, builder) {
          throw "Label-pop called outside of a macro";
        }
      },
      "$number": {
        params: [],
        action: function (args, builder) {
          throw "Number-pop called outside of a macro";
        }
      },
      "$string": {
        params: [],
        action: function (args, builder) {
          throw "String-pop called outside of a macro";
        }
      },
      "$redef": {
        params: [],
        action: function (args, builder) {
          throw "Can't redefine macro outside of a macro"
        }
      }
    };
  };

  const mnemo = (function () {
    const mnemoCodes = {};
    // Collect keywords
    for (const keyword of ws.keywords) {
      mnemoCodes[keyword.mnemo] = keyword;
    }

    return mnemoCodes;
  })();

  const parseWhitespace = function (strArr) {
    let space = "";
    while (strArr.hasNext() && /[ \t\n\r]/.test(strArr.peek())) {
      space += strArr.getNext();
    }
    return {
      type: "SPACE",
      token: space
    };
  };

  const parseLineComment = function (strArr) {
    let comment = "";
    do {
      comment += strArr.getNext();
    } while (strArr.hasNext() && strArr.peek() !== '\n');
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseMultiLineComment = function (strArr) {
    let depth = 0;
    let comment = "";
    while (true) {
      if (!strArr.hasNext()) {
        throw "Unterminated multiline comment";
      }
      const ch = strArr.getNext();
      comment += ch;
      if (ch === "{" && strArr.peek() === "-") {
        depth += 1;
        comment += strArr.getNext();
      } else if (ch === "-" && strArr.peek() === "}") {
        depth -= 1;
        comment += strArr.getNext();
        if (depth === 0) {
          break;
        }
      }
    }
    return {
      type: "COMMENT",
      token: comment
    };
  };

  const parseNumber = function (strArr) {
    let numStr = "";
    while (strArr.hasNext() && /^[+-]?\d*$/.test(numStr + strArr.peek())) {
      numStr += strArr.getNext();
    }

    let type = "NUMBER";
    if (strArr.peek() === ":") {
      type = "LABEL";
      strArr.getNext();
    }

    try {
      const data = BigInt(numStr);
      return {
        type: type,
        token: numStr,
        data: data
      };
    } catch (err) {
      throw "Illegal number";
    }
  };

  const getStringArray = function (str) {
    const result = [];
    let escape = false;
    let chCode = "";
    for (const ch of str.slice(1, -1)) {
      if (chCode) {
        if (/[0-9]/.test(ch)) {
          chCode += ch;
          continue;
        } else {
          result.push(BigInt(chCode));
          chCode = "";
        }
      }
      if (escape) {
        if (ch === 'n') {
          result.push(BigInt('\n'.charCodeAt(0)));
        } else if (ch === 't') {
          result.push(BigInt('\t'.charCodeAt(0)));
        } else if (/[0-9]/.test(ch)) {
          chCode += ch;
        } else {
          result.push(BigInt(ch.codePointAt(0)));
        }
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else {
        result.push(BigInt(ch.codePointAt(0)));
      }
    }
    if (chCode) {
      result.push(BigInt(chCode));
    }
    if (str[0] === '"') {
      result.push(0n);
    }
    return result;
  };

  const parseString = function (strArr) {
    const strEnd = strArr.getNext();
    let str = strEnd;
    while (true) {
      if (!strArr.hasNext()) {
        throw "Unterminated string";
      }
      const ch = strArr.getNext();
      str += ch;
      if (ch === strEnd) {
        break;
      } else if (ch === '\n') {
        throw "Unexpected end of line";
      } else if (ch === '\\' && strArr.hasNext()) {
        str += strArr.getNext();
      }
    }
    return {
      type: "STRING",
      token: str,
      data: getStringArray(str)
    };
  };

  const parseLabel = function (strArr, builder) {
    let label = "";
    while (strArr.hasNext() && /[0-9a-zA-Z_$.]/.test(strArr.peek())) {
      label += strArr.getNext();
    }

    let type = "TOKEN";
    let op = null;
    if (strArr.peek() === ':') {
      type = "LABEL";
      strArr.getNext();
    } else if (label in mnemo) {
      type = "KEYWORD";
      op = mnemo[label];
    } else if (label in builder.macros) {
      type = "MACRO";
    }

    return {
      type: type,
      token: label,
      op: op
    };
  };

  const getTokens = function (strArr, builder) {
    let prevSpace = true;
    while (strArr.hasNext()) {
      if (parseWhitespace(strArr).token) {
        prevSpace = true;
        continue;
      }

      let token = null;
      builder.pos = strArr.pos();
      const next = strArr.peek();
      if (next === ';' || next === '#' || (next === '-' && strArr.peek(1) === '-')) {
        token = parseLineComment(strArr);
      } else if (next === '{' && strArr.peek(1) === '-') {
        token = parseMultiLineComment(strArr);
      } else if (/["']/.test(next)) {
        token = parseString(strArr);
      } else if (/[-+\d]/.test(next)) {
        token = parseNumber(strArr);
      } else if (/[a-zA-Z_$.]/.test(next)) {
        token = parseLabel(strArr, builder);
      } else {
        throw `Illegal character: '${next}'`;
      }
      token.pos = builder.pos;

      if (token.type === "COMMENT") {
        prevSpace = true;
        continue;
      }

      if (!prevSpace) {
        const prev = builder.tokens[builder.tokens.length-1];
        throw `Missing space between ${prev.token} and ${token.token}`;
      }
      // Implicit space after :
      prevSpace = token.type === "LABEL";

      builder.tokens.push(token);
    }
  };

  const pushInstruction = function (builder, constr, numberArg) {
    const instruction = new constr();
    if (numberArg != null) {
      instruction.arg = {token: ws_util.getWsSignedNumber(numberArg), value: numberArg};
    }
    builder.pushInstruction(instruction);
  };

  const postProcess = function (builder) {
    while (builder.externals.length > 0) {
      const ext = builder.externals.shift();
      for (const inst of ext.programStack) {
        builder.pushInstruction(inst);
      }
    }
    return builder.postProcess();
  };

  const checkMacroArgs = function (token, builder) {
    const macro = builder.macros[token];
    if (typeof macro.action === "function") {
      let n = 0;
      for (const paramType of macro.params) {
        const arg = builder.tokens[n++];
        if (!arg || (arg.type !== paramType &&
            !(paramType === "NUMBER" && arg.type === "STRING" && arg.data.length === 1))) {
          return false;
        }
      }
    }
    return true;
  };

  return {
    compile: function (str, master) {
      const strArr = ws_util.StrArr(str);
      const builder = ws.programBuilder(str, master);
      let tokenError;
      builder.macros = builder.macros || builtinMacros();
      builder.includes = builder.includes || {};
      builder.externals = builder.externals || [];
      builder.tokens = [];
      builder.pos = strArr.pos();
      try {
        getTokens(strArr, builder);
      } catch (err) {
        tokenError = {
          tokens: builder.tokens,
          pos: builder.pos,
          message: `${err} at ${builder.pos.line}:${builder.pos.col}`,
          line: builder.pos.line,
          col: builder.pos.col
        };
      }
      builder.asmLabeler = builder.asmLabeler || ws_util.labelTransformer(function(counter, label) {
        return ws_util.getWsUnsignedNumber(counter);
      });

      const labeler = builder.asmLabeler;

      let parentLabel = "";

      while (builder.tokens.length > 0) {
        const token = builder.tokens.shift();
        const pos = token.pos;
        try {
          if (token.type === "LABEL" || (token.op && token.op.constr === ws.WsLabel)) {
            let labelAsm;
            if (token.type === "LABEL") {
              // Colon-style label
              labelAsm = token.token;
            } else {
              // Mnemonic-style label
              const arg = builder.tokens.shift();
              if (!arg || arg.type !== "TOKEN" && arg.type !== "MACRO" && arg.type !== "KEYWORD" && arg.type !== "NUMBER") {
                throw "Expected label argument";
              }
              labelAsm = arg.token;
            }

            if (ws_util.isLocalLabel(labelAsm)) {
              labelAsm = parentLabel + labelAsm;
            } else {
              parentLabel = labelAsm;
            }

            const label = labeler.getLabel(labelAsm);
            if (typeof builder.labels[label] === "number") {
              throw `Multiple definitions of label ${labelAsm}`;
            }

            builder.labels[label] = builder.programStack.length;
            builder.asmLabels[label] = labelAsm;
          } else if (token.token in builder.macros && checkMacroArgs(token.token, builder)) {
            token.type = "MACRO"; // can be label in some cases
            const macro = builder.macros[token.token];
            if (typeof macro.action === "function") {
              const args = [token];
              for (const paramType of macro.params) {
                const arg = builder.tokens.shift();
                if (!arg || (arg.type !== paramType &&
                    !(paramType === "NUMBER" && arg.type === "STRING" && arg.data.length === 1))) {
                  throw `Expected ${paramType} argument`;
                } else {
                  args.push(arg);
                }
              }
              macro.action(args, builder);
            } else {
              throw `Unimplemented macro type ${typeof macro.action}`;
            }
          } else if (token.type === "KEYWORD") {
            const op = token.op;
            let instruction = new op.constr();

            if (op.optParam === 'NUMBER' && builder.tokens[0] && builder.tokens[0].type === op.optParam) {
              pushInstruction(builder, ws.WsPush, builder.tokens.shift().data);
            }

            if (op.param) {
              const arg = builder.tokens.shift();
              if (!arg) {
                throw "Argument expected";
              }
              if (op.param === "NUMBER") {
                if (arg.type === "NUMBER") {
                  pushInstruction(builder, op.constr, arg.data);
                } else if (instruction instanceof ws.WsPush && arg.type === "STRING") {
                  for (let i = arg.data.length - 1; i >= 0; i--) {
                    pushInstruction(builder, op.constr, arg.data[i]);
                  }
                } else {
                  throw `Unexpected token: ${arg.token}`;
                }
              } else if (op.param === "LABEL") {
                if (arg.type === "TOKEN" || arg.type === "MACRO" || arg.type === "KEYWORD" || arg.type === "NUMBER") {
                  instruction = new op.constr();
                  let label = arg.token;
                  if (ws_util.isLocalLabel(label)) label = parentLabel + label;

                  instruction.arg = {
                    token: labeler.getLabel(label), value: null, label: label
                  };
                  builder.pushInstruction(instruction);
                } else {
                  throw "Expected label argument";
                }
              } else {
                throw `Unsupported argument type ${op.param} (should never happen)`
              }
            } else {
              pushInstruction(builder, op.constr);
            }
          } else if (token.token in builder.macros) {
            throw `Incorrect argument types for macro ${token.token}`;
          } else {
            throw `Unexpected token: ${token.token}`;
          }
        } catch (err) {
          if (typeof err === "string") {
            throw {
              program: null,
              line: pos.line,
              message: `${err} at ${pos.line}:${pos.col}`
            };
          } else {
            throw err;
          }
        }
      }

      if (tokenError) {
        throw {
          program: null,
          line: tokenError.pos.line,
          message: tokenError.message
        };
      }

      try {
        return postProcess(builder);
      } catch (err) {
        if (typeof err === "string") {
          throw {
            message: err
          };
        } else {
          throw err;
        }
      }
    }
  };
})();
