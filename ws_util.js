var ws_util = (function () {
  return {
    getWsUnsignedNumber: function (num) {
      var result = "";
      while (num > 0) {
        result += (num & 1) ? ' ' : '\t';
        num >>= 1;
      }
      return result;
    },
    getWsSignedNumber: function (num) {
      return ((num >= 0) ? ' ' : '\t') + this.getWsUnsignedNumber(num);
    }
  };
})();
