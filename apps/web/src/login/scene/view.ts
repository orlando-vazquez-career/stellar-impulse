/** Vista de dibujo: tamaño lógico del lienzo en píxeles de diseño. La escena
 * se compone en un espacio de 1280×720 y el orquestador aplica cover-fit. */
export interface View {
  width: number;
  height: number;
}

export interface Pointer {
  /** -1..1 normalizado; las capas lo usan con distinto peso de paralaje. */
  x: number;
  y: number;
}
