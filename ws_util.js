var ws_util = (function () {
  return {
    getWsUnsignedNumber: function (num) {
      var result = "";
      while (num > 0) {
        result = ((num & 1) ? '\t' : ' ') + result;
        num >>= 1;
      }
      return result + '\n';
    },
    getWsSignedNumber: function (num) {
      return ((num >= 0) ? ' ' : '\t') + this.getWsUnsignedNumber(num);
    },
    labelTransformer: function (labelGenerator) {
      var length = 0;
      return {
        length: length,
        labels: {},
        getLabel: function (label) {
          if (label in this.labels) {
            return this.labels[label];
          } else {
            var gen = labelGenerator(length++);
            this.labels[label] = gen;
            return gen;
          }
        }
      };
    },
    getFilename: function (path) {
      return path.replace(/^(?:.*[\/\\])?((?:[^\/\\])*)$/, '$1');
    },
    handleOverflow: function(selector) {
      var selector$ = $(selector);

      if (selector$[0].scrollHeight > selector$.height()) {
        selector$.css('overflow-y', 'scroll');
      } else {
        selector$.css('overflow-y', 'hidden');
      }
    }
  };
})();
