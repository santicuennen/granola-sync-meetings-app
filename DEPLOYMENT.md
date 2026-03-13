# Meetings Vault - Deployment Guide

## Architecture Overview

```
Windows PC (Local)
    ↓
Granola App → cache-v6.json
    ↓
PowerShell Script (hourly)
    ↓
AWS S3 (grnl-meetings bucket)
    ↓
Vercel (Next.js App)
    ↓
Users (Web Browser)
```

## Environment Variables

Configure estas variables en Vercel (Settings → Environment Variables):

### AWS S3 Configuration (Required)

```bash
AWS_ACCESS_KEY_ID=AKIAYAPSDAMLQ3XZOLWZ
AWS_SECRET_ACCESS_KEY=<tu-secret-key>
AWS_REGION=us-east-1
GRANOLA_S3_BUCKET=grnl-meetings
```

### Optional Configuration

```bash
NODE_ENV=production
```

## Local Development

### 1. Install dependencies

```bash
cd meetings-app
npm install
```

### 2. Create `.env.local`

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=AKIAYAPSDAMLQ3XZOLWZ
AWS_SECRET_ACCESS_KEY=<tu-secret-key>
AWS_REGION=us-east-1
GRANOLA_S3_BUCKET=grnl-meetings
```

### 3. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/meetings-vault.git
git push -u origin main
```

### 2. Import to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repo
4. Vercel auto-detects Next.js

### 3. Configure Environment Variables

In Vercel Dashboard → Settings → Environment Variables, add:

```
AWS_ACCESS_KEY_ID = AKIAYAPSDAMLQ3XZOLWZ
AWS_SECRET_ACCESS_KEY = <tu-secret-key>
AWS_REGION = us-east-1
GRANOLA_S3_BUCKET = grnl-meetings
```

Apply to: Production, Preview, Development

### 4. Deploy

Click "Deploy" or:

```bash
npm i -g vercel
vercel --prod
```

## Local Sync Setup (Windows)

### 1. Configure AWS Profile

```powershell
aws configure --profile cuen-pers
# AWS Access Key ID: AKIAYAPSDAMLQ3XZOLWZ
# AWS Secret Access Key: <tu-secret-key>
# Default region: us-east-1
# Default output format: json
```

### 2. Set Environment Variables

```powershell
$env:GRANOLA_S3_BUCKET = "grnl-meetings"
$env:AWS_REGION = "us-east-1"
$env:GRANOLA_AWS_PROFILE = "cuen-pers"
```

### 3. Test Sync

```powershell
cd granola-sync-service
.\sync-granola-to-s3.ps1 -Test
.\sync-granola-to-s3.ps1 -RunOnce
```

### 4. Install Automated Sync

```powershell
.\sync-granola-to-s3.ps1 -Install
```

This creates a Windows Task that runs:
- At Windows startup (after 60 seconds)
- Every hour (to capture recent transcripts)

### 5. Verify Task

```powershell
# Check task status
Get-ScheduledTask -TaskName "GranolaS3Sync"

# View logs
Get-Content .\sync.log -Tail 20
```

## S3 Bucket Structure

```
grnl-meetings/
├── meetings.json                      # Latest meetings data
└── backups/
    ├── meetings-20260313-132504.json  # Timestamped backups
    └── meetings-20260313-125749.json
```

## Data Flow

1. **Granola records meeting** → Saves to local cache (`cache-v6.json`)
2. **PowerShell script runs** (hourly) → Reads cache, extracts meetings with transcripts
3. **Uploads to S3** → `meetings.json` + timestamped backup
4. **Vercel API fetches** → Reads from S3 on each request
5. **Frontend displays** → Shows meetings to users

## Transcript Capture Window

⚠️ **Important:** Transcripts are only available locally while Granola is processing the meeting. Once processed, Granola deletes local transcript segments.

**To maximize transcript capture:**
- Script runs hourly to catch recent meetings
- Transcripts include speaker attribution (`me` vs `them`)
- Each segment has timestamps (`start`, `end`)

## Troubleshooting

### API returns mock data

**Cause:** AWS credentials not configured

**Fix:**
1. Check Vercel environment variables
2. Verify AWS credentials are correct
3. Test S3 access: `aws s3 ls s3://grnl-meetings --profile cuen-pers`

### Meetings not updating

**Cause:** Sync script not running

**Fix:**
1. Check Windows Task Scheduler: `Get-ScheduledTask -TaskName "GranolaS3Sync"`
2. View logs: `Get-Content granola-sync-service\sync.log -Tail 50`
3. Run manually: `.\sync-granola-to-s3.ps1 -RunOnce`

### Transcripts are empty

**Cause:** Script ran after Granola processed the meeting

**Fix:**
- Transcripts are ephemeral - only available during/immediately after recording
- Increase sync frequency or run script right after meetings
- Check `state.transcripts` in cache while Granola is open

### S3 upload fails

**Cause:** AWS credentials or permissions issue

**Fix:**
1. Verify AWS CLI is installed: `aws --version`
2. Test credentials: `aws s3 ls --profile cuen-pers`
3. Check IAM permissions for S3 write access

## IAM Permissions Required

The AWS user needs these S3 permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::grnl-meetings",
        "arn:aws:s3:::grnl-meetings/*"
      ]
    }
  ]
}
```

## Monitoring

### Check sync status

```powershell
# View recent logs
Get-Content granola-sync-service\sync.log -Tail 20

# Check last sync time
Get-Item granola-sync-service\output\meetings.json | Select-Object LastWriteTime

# View S3 file
aws s3 ls s3://grnl-meetings/ --profile cuen-pers
```

### Vercel logs

```bash
vercel logs
```

Or in Dashboard: Deployments → [your deploy] → Logs

## Uninstall

To remove the automated sync:

```powershell
cd granola-sync-service
.\sync-granola-to-s3.ps1 -Uninstall
```
