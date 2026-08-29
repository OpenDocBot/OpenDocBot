// Core tools
import "./word/editDocText";
import "./word/editDocList";
import "./word/readDocSection";
import "./word/searchDocText";
import "./word/verifyDoc";
import "./word/collapseBlankParagraphs";
import "./word/setPageBreak";
import "./word/executeOfficeJs";
import "./word/askUserQuestion";

// Excel tools
import "./excel/listWorksheets";
import "./excel/readRange";
import "./excel/writeRange";
import "./excel/formatRange";
import "./excel/insertRowsColumns";
import "./excel/deleteRowsColumns";
import "./excel/setColumnWidth";
import "./excel/setRowHeight";
import "./excel/mergeCells";
import "./excel/clearRange";
import "./excel/sortRange";

// PowerPoint tools
import "./powerpoint/getPresentationStructure";
import "./powerpoint/listSlideShapes";
import "./powerpoint/readSlide";
import "./powerpoint/readSlideText";
import "./powerpoint/listMasters";
import "./powerpoint/verifySlides";
import "./powerpoint/modifyPresentationStructure";
import "./powerpoint/insertSlideElement";
import "./powerpoint/removeSlideElement";
import "./powerpoint/editSlideText";
import "./powerpoint/editSlideXml";
import "./powerpoint/formatShape";

// Task-list tools (host-agnostic)
import "./todo/updateTodos";

export { toolRegistry, executeTool } from "./registry";
export type { ToolRegistry, ToolExecutor, ToolCallRequest, ToolCallResult } from "./types";
export { buildDocState, buildUserSelection } from "./docState";
