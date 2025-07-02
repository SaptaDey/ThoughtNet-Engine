# Security Policy

## Supported Versions

We take security seriously. The following versions of ThoughtNet-Engine are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We appreciate your efforts to responsibly disclose your findings, and will make every effort to acknowledge your contributions.

### How to Report

To report a security vulnerability, please use one of the following methods:

1. **Email**: Send an email to security@thoughtnet-engine.com (preferred)
2. **GitHub Security Advisory**: Use GitHub's private vulnerability reporting feature
3. **Encrypted Communication**: Use our PGP key for sensitive reports

### What to Include

Please include the following information in your report:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 7 days
- **Status Updates**: We will provide regular updates on our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Disclosure Policy

- We will work with you to understand and resolve the issue quickly
- We will not take legal action against you if you follow this policy
- We will acknowledge your contribution (unless you prefer to remain anonymous)
- We will coordinate disclosure timing with you

### Security Measures

ThoughtNet-Engine implements several security measures:

- **Authentication**: JWT-based authentication for API access
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: Comprehensive input validation using Zod schemas
- **Security Headers**: Implemented using Helmet.js
- **Data Encryption**: Sensitive data is encrypted at rest and in transit
- **Audit Logging**: Comprehensive logging of security-relevant events

### Safe Harbor

We consider security research conducted under this policy to be:

- Authorized in accordance with the Computer Fraud and Abuse Act
- Authorized in accordance with the DMCA
- Compliant with our Terms of Service
- Exempt from restrictions in our Acceptable Use Policy that would otherwise prohibit this activity

Thank you for helping keep ThoughtNet-Engine and our users safe!
