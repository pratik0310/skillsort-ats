const express = require('express');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// File upload config
const upload = multer({ dest: 'uploads/' });

app.post('/apply', upload.single('resume'), async (req, res) => {
  const email = req.body.email;
  const role = req.body.role;
  const filePath = req.file.path;

  let resumeText = '';

  // Parse PDF resume
  try {
    const buffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(buffer);
    resumeText = pdfData.text;
  } catch (err) {
    return res.status(500).send('Failed to parse resume.');
  }

  // Prepare Gemini prompt
const prompt = `
You are an HR recruiter with a positive and optimistic approach.

Evaluate the following resume for the job role: "${role}".

Resume:
${resumeText}

Rules:
-if the resume not include relevant skills reject it
- Be kind and constructive.
- If rejecting, include 1-2 short improvement suggestions.
- Response format must be:
"Selected - [Short reason]" or
"Not Selected - [Short reason]. Suggestions: [Improvement tips]"

Give a human-style, supportive tone.
`;

  let decision;
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    decision = result.response.text().trim();
  } catch (err) {
    return res.status(500).send('Error generating AI response.');
  }

  // Send email to user
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.ADMIN_EMAIL,
      pass: process.env.ADMIN_PASS,
    },
  });

  const mailOptions = {
    from: `"SkillSort" <${process.env.ADMIN_EMAIL}>`,
    to: email,

    subject: `Application Result for ${role}`,
    text: `Dear Candidate,\n\nYour application result is:\n\n${decision}\n\nRegards,\nSkillSort Team`,
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).send("Failed to send email.");
  }
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
