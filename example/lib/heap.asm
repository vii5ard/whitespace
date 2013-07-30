printHeapC:
  dup
  retrieve
  dup
  jz _printHeapC
  printc
  jmp printHeapC
_printHeapC:
  drop
  drop
  ret

printHeapI:
  dup
  retrieve
  dup
  jz _printHeapI
  printi
  jmp printHeapI
_printHeapI:
  drop
  drop
  ret

