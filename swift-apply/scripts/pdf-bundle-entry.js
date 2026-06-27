// pdfmake + embedded fonts bundled for Chrome extension content script
import pdfMake from 'pdfmake/build/pdfmake';
import vfsFonts from 'pdfmake/build/vfs_fonts';

// Attach the virtual font filesystem so pdfmake can render text
pdfMake.vfs = vfsFonts.pdfMake ? vfsFonts.pdfMake.vfs : vfsFonts;

export default pdfMake;
