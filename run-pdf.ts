import { extractPageRange } from "./pdf/pdf-processor";

const pdfUri = "./dnd_5e_rules.pdf";
const startPage = 10;
const endPage = 15;

const result = await extractPageRange(pdfUri, startPage, endPage);

console.log(result);
