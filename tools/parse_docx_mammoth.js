#!/usr/bin/env node
// parse_docx_mammoth.js
// Usage: node parse_docx_mammoth.js sample.docx
// Requires: npm install mammoth cheerio

const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const cheerio = require('cheerio');

/**
 * ParsedQuestion schema:
 * { question_text, options?, correct_answer?, answer_text?, marks?, btl?, course_outcomes?, course_outcomes_numbers?, images?, chapter?, type?, source_file_path? }
 */

function stripNumbering(text) {
  return (text || '').replace(/^\s*\d+[\.)]?\s*/, '').replace(/^\s*(?:Q\.|Q:|Question\s*\d*[\.)]?)\s*/i, '').trim();
}

function looksLikeQuestion(text) {
  if (!text) return false;
  if (/^\s*\d+[\.\)]\s*/.test(text)) return true;
  if (/^\s*Q[:.\s]/i.test(text)) return true;
  if ((text || '').split(/\s+/).length > 4 && !/^(marks|btl|answer|ans|co|chapter)/i.test(text)) return true;
  return false;
}

function splitOptions(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const l of lines) {
    const m = l.match(/^[\(\[]?([A-Da-d])\)|[A-Da-d][\)\.]/);
    const m2 = l.match(/^[\(\[]?([A-Da-d])[\)\.\]]\s*(.+)$/);
    if (m2) out.push(m2[2].trim());
    else {
      // try alternate pattern
      const alt = l.match(/^[A-Da-d][\)\.\s]+(.+)$/);
      out.push((alt && alt[1]) ? alt[1].trim() : l);
    }
  }
  return out.length ? out : null;
}

function mapTableRowToParsedQuestion(rowObj) {
  // rowObj: headerLower -> { html, text }
  const res = {
    question_text: null,
    options: null,
    correct_answer: null,
    answer_text: null,
    marks: null,
    btl: null,
    course_outcomes: null,
    course_outcomes_numbers: null,
    images: null,
    chapter: null,
    type: null,
    source_file_path: null,
  };

  for (const hk of Object.keys(rowObj)) {
    const val = rowObj[hk] || { html: '', text: '' };
    const h = hk.toLowerCase();
    const text = (val.text || '').trim();
    const html = val.html || '';

    if (/question|q\W|question text/.test(h)) res.question_text = res.question_text || text;
    else if (/option|choices?|answers? options?/.test(h)) res.options = res.options || splitOptions(text);
    else if (/marks?/i.test(h)) res.marks = res.marks ?? (parseInt(text) || null);
    else if (/btl|bloom/i.test(h)) res.btl = res.btl ?? (parseInt(text) || null);
    else if (/co\b|course outcome/i.test(h)) res.course_outcomes = res.course_outcomes || text;
    else if (/co\s*#|cos|course outcome numbers/i.test(h)) res.course_outcomes_numbers = res.course_outcomes_numbers || (text.match(/\d+/g) || []).join(',') || null;
    else if (/answer|ans|key|correct/i.test(h)) res.correct_answer = res.correct_answer || text;
    else if (/explanat|explain|explanation/i.test(h)) res.answer_text = res.answer_text || text;
    else if (/image|figure/i.test(h)) {
      const $ = cheerio.load(html || '');
      const imgs = $('img').toArray().map(i => $(i).attr('src')).filter(Boolean);
      if (imgs.length) res.images = (res.images || []).concat(imgs);
    } else if (/chapter|section|topic/i.test(h)) res.chapter = res.chapter || text;
    else if (/type/i.test(h)) res.type = res.type || text;
    else if (/source|source file/i.test(h)) res.source_file_path = res.source_file_path || text;
    else if (/course code|course name|semester/i.test(h)) {
      // ignore for now or map into course fields if needed later
    } else {
      // unknown header; ignore
    }
  }

  if (!res.question_text) return null;
  if (res.options && Array.isArray(res.options) && res.options.length === 0) res.options = null;
  if (res.images && res.images.length === 0) res.images = null;
  return res;
}

async function parseDocxWithImages(filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.convertToHtml({ buffer }, {
    convertImage: mammoth.images.inline(element =>
      element.read('base64').then(b64 => ({ src: `data:${element.contentType};base64,${b64}` }))
    )
  });

  const $ = cheerio.load(result.value || '');
  const blocks = $('body').children().toArray();
  const questions = [];
  let current = null;
  let currentChapter = null;

  const pushCurrent = () => {
    if (current) {
      // normalize images
      current.images = current.images && current.images.length ? current.images : null;
      // ensure schema
      const out = {
        question_text: current.question_text || '',
        options: current.options || null,
        correct_answer: current.correct_answer || null,
        answer_text: current.answer_text || null,
        marks: current.marks != null ? Number(current.marks) : null,
        btl: current.btl != null ? Number(current.btl) : null,
        course_outcomes: current.course_outcomes || null,
        course_outcomes_numbers: current.course_outcomes_numbers || null,
        images: current.images || null,
        chapter: current.chapter || currentChapter || null,
        type: current.type || null,
        source_file_path: current.source_file_path || null,
      };
      questions.push(out);
      current = null;
    }
  };

  for (const el of blocks) {
    const tag = el.tagName && el.tagName.toLowerCase();
    if (!tag) continue;

    if (tag === 'p' || /^h[1-6]$/.test(tag) || tag === 'div') {
      const text = $(el).text().trim();

      // chapter/section header
      if (/^\s*(Chapter|Section|Topic)\s*[:\-]/i.test(text) && !current) {
        currentChapter = text.replace(/^\s*(Chapter|Section|Topic)\s*[:\-]\s*/i, '').trim();
        continue;
      }

      if (looksLikeQuestion(text)) {
        pushCurrent();
        current = {
          question_text: stripNumbering(text),
          options: null,
          correct_answer: null,
          answer_text: null,
          marks: null,
          btl: null,
          course_outcomes: null,
          course_outcomes_numbers: null,
          images: [],
          chapter: currentChapter || null,
          type: null,
          source_file_path: null,
        };
        // attach inline images
        $(el).find('img').each((i, img) => {
          const src = $(img).attr('src');
          if (src) current.images.push(src);
        });
        continue;
      }

      // metadata / option lines
      if (current) {
        const t = text;
        if (/marks\s*[:=]/i.test(t)) {
          const m = t.match(/marks\s*[:=]\s*(\(OR\)|\d+)/i);
          if (m) current.marks = m[1];
          continue;
        }
        if (/btl\s*[:=]/i.test(t)) {
          const m = t.match(/btl\s*[:=]\s*(\(OR\)|\d+)/i);
          if (m) current.btl = m[1];
          continue;
        }
        if (/^(answer|ans)\s*[:=]/i.test(t)) {
          const mm = t.replace(/^(answer|ans)\s*[:=]\s*/i, '').trim();
          current.correct_answer = mm;
          continue;
        }
        if (/explanat|explain/i.test(t)) {
          const mm = t.replace(/explanation\s*[:=]?/i, '').trim();
          current.answer_text = current.answer_text ? (current.answer_text + ' ' + mm) : mm;
          continue;
        }
        // option lines
        const optMatch = t.match(/^[\(\[]?([A-Za-z])[\)\.\]]\s*(.+)$/);
        if (optMatch) {
          current.options = current.options || [];
          current.options.push(optMatch[2].trim());
          continue;
        }
      }

      // images in non-question paragraph -> attach to current if exists
      $(el).find('img').each((i, img) => {
        const src = $(img).attr('src');
        if (src && current) current.images.push(src);
      });

    } else if (tag === 'table') {
      // flush any pending paragraph question
      if (current) pushCurrent();

      const headerCells = [];
      $(el).find('tr').each((ri, row) => {
        const cells = $(row).find('th,td').toArray();
        if (ri === 0) {
          cells.forEach(c => headerCells.push($(c).text().trim().toLowerCase()));
        } else {
          const rowObj = {};
          cells.forEach((c, ci) => {
            const h = headerCells[ci] || `col${ci}`;
            rowObj[h] = { html: $(c).html() || '', text: $(c).text().trim() || '' };
          });
          const mapped = mapTableRowToParsedQuestion(rowObj);
          if (mapped) {
            // ensure images parsed from html image tags are data urls (mammoth inlined them)
            mapped.images = mapped.images || null;
            questions.push(mapped);
          }
        }
      });
    }
  }

  pushCurrent();

  // debug logs
  const totalImages = questions.reduce((s, q) => s + ((q.images && q.images.length) ? q.images.length : 0), 0);
  console.error('parse_docx_mammoth: blocks:', blocks.length, 'questions:', questions.length, 'images:', totalImages);

  return questions;
}

// CLI runner
(async () => {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node parse_docx_mammoth.js file.docx'); process.exit(2); }
  const abs = path.resolve(process.cwd(), file);
  try {
    const qs = await parseDocxWithImages(abs);
    console.log('questions:', qs.length);
    if (qs.length) {
      console.log(JSON.stringify(qs.slice(0, 3), null, 2));
      const imgCount = qs.reduce((s,q) => s + ((q.images && q.images.length) ? q.images.length : 0), 0);
      console.log('total images found:', imgCount, 'example data:image?:', ((qs[0].images && qs[0].images[0]) || '').startsWith('data:image/'));
    }
    process.exit(0);
  } catch (err) {
    console.error('Error parsing DOCX:', err);
    process.exit(3);
  }
})();

// Export for programmatic use
module.exports = {
  parseDocxWithImages,
};
