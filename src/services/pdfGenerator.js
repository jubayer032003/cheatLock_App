import puppeteer from "puppeteer";
import { logger } from "./logger.js";

/**
 * Generates an enterprise-grade PDF report of exam integrity statistics and student risk profiles.
 * 
 * @param {object} exam Exam details
 * @param {object} reportData Comprehensive integrity report payload
 * @returns {Promise<Buffer>} PDF binary buffer
 */
export async function generateExamReportPdf(exam, reportData) {
  let browser = null;
  try {
    logger.info(`Starting PDF generation for exam report: ${exam.title} (${exam._id})`);
    
    // Launch headless Chromium
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    
    const page = await browser.newPage();
    
    // Construct HTML template with premium, clean visual design
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
          
          body {
            font-family: 'Inter', sans-serif;
            color: #1e293b;
            background: #ffffff;
            margin: 0;
            padding: 40px;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          
          .title {
            margin: 0;
            font-size: 24px;
            font-weight: 700;
            color: #0f172a;
          }
          
          .subtitle {
            margin: 5px 0 0 0;
            font-size: 14px;
            color: #64748b;
          }
          
          .logo {
            font-size: 20px;
            font-weight: 800;
            color: #6366f1;
            letter-spacing: -0.025em;
          }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
            margin-bottom: 35px;
          }
          
          .stat-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 15px 20px;
          }
          
          .stat-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #64748b;
            font-weight: 600;
          }
          
          .stat-value {
            font-size: 24px;
            font-weight: 700;
            color: #0f172a;
            margin-top: 5px;
          }
          
          .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 0.025em;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          
          th {
            background: #f1f5f9;
            color: #475569;
            text-align: left;
            padding: 12px 16px;
            font-size: 12px;
            font-weight: 600;
            border-bottom: 2px solid #cbd5e1;
          }
          
          td {
            padding: 12px 16px;
            font-size: 13px;
            border-bottom: 1px solid #e2e8f0;
            color: #334155;
          }
          
          tr:nth-child(even) td {
            background: #f8fafc;
          }
          
          .badge {
            display: inline-block;
            padding: 4px 8px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 4px;
            text-transform: uppercase;
          }
          
          .badge-high {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fee2e2;
          }
          
          .badge-medium {
            background: #fffbeb;
            color: #d97706;
            border: 1px solid #fef3c7;
          }
          
          .badge-low {
            background: #f0fdf4;
            color: #16a34a;
            border: 1px solid #dcfce7;
          }
          
          .footer {
            margin-top: 50px;
            border-top: 1px solid #e2e8f0;
            padding-top: 15px;
            text-align: center;
            font-size: 11px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="title">${exam.title}</h1>
            <p class="subtitle">Integrity Report Generated on ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="logo">CheatLock Pro</div>
        </div>
        
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Candidates</div>
            <div class="stat-value">${reportData.summary.totalStudents}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Flagged High Risk</div>
            <div class="stat-value" style="color: #dc2626">${reportData.summary.highRiskCount}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Suspicious Events</div>
            <div class="stat-value">${reportData.summary.suspiciousAlertsTotal}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg Risk Score</div>
            <div class="stat-value">${reportData.summary.averageSuspicionScore}%</div>
          </div>
        </div>
        
        <div class="section-title">Candidate Risk Analysis</div>
        <table>
          <thead>
            <tr>
              <th>Candidate Identifier</th>
              <th>Status</th>
              <th>Suspicion Score</th>
              <th>Risk Assessment</th>
              <th>Core Violations</th>
            </tr>
          </thead>
          <tbody>
            ${reportData.students.map(s => {
              const risk = s.finalRiskScore >= 70 ? 'HIGH' : s.finalRiskScore >= 40 ? 'MEDIUM' : 'LOW';
              const badgeClass = risk === 'HIGH' ? 'badge-high' : risk === 'MEDIUM' ? 'badge-medium' : 'badge-low';
              
              const violations = [];
              if (s.breakdown.faceMissingCount > 0) violations.push(`Face Missing (${s.breakdown.faceMissingCount})`);
              if (s.breakdown.appSwitchCount > 0) violations.push(`App Switch (${s.breakdown.appSwitchCount})`);
              if (s.breakdown.wasLocked) violations.push('Session Locked');
              
              return `
                <tr>
                  <td><strong>${s.studentId}</strong><br><span style="color: #64748b; font-size: 11px;">${s.studentName}</span></td>
                  <td>${s.status}</td>
                  <td>${s.finalRiskScore}%</td>
                  <td><span class="badge ${badgeClass}">${risk}</span></td>
                  <td>${violations.join(', ') || 'No infractions recorded'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          CheatLock Kiosk K12 & Higher-Ed Examination Audit Trail. Confidential.
        </div>
      </body>
      </html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    
    // Render PDF matching standard A4 dimensions
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        bottom: "20px",
        left: "20px",
        right: "20px",
      },
    });
    
    logger.info(`PDF generated successfully for exam: ${exam.title}`);
    return pdfBuffer;
  } catch (error) {
    logger.error(`Failed to generate exam PDF report: ${error.message}`);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
