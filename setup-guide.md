# GIS Data Processing Guide

## Overview
This project processes California Fire Hazard Severity Zone GIS data from shapefiles and inserts it into a Supabase database.

## Prerequisites
1. Node.js installed
2. Supabase account and project
3. GIS shapefile data in the `unzipped` folder

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Supabase
1. Go to your Supabase project dashboard
2. Get your project URL and anon key
3. Update the `.env` file:
```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-here
```

### 3. Create Database Table
Your Supabase table should have these columns:

```sql
CREATE TABLE calfire_zone_risk (
    id BIGSERIAL PRIMARY KEY,
    sra TEXT,
    incorp TEXT,
    geometry TEXT,
    haz_code BIGINT,
    haz_class TEXT,
    shape_leng NUMERIC,
    shape_area NUMERIC,
    vh_rec TEXT,
    area TEXT,
    perimeter TEXT,
    fid_c19fhs TEXT,
    objectid TEXT,
    source_folder TEXT,
    source_file TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. Disable Row Level Security (for bulk insert)
Run this in your Supabase SQL editor:
```sql
ALTER TABLE calfire_zone_risk DISABLE ROW LEVEL SECURITY;
```

## Data Structure Found

From inspecting your data, I found these properties:
- **SRA**: State Responsibility Area designation
- **INCORP**: Incorporation status  
- **HAZ_CODE**: Hazard code (1=Moderate, 2=High, 3=Very High)
- **HAZ_CLASS**: Hazard class text ("Moderate", "High", "Very High")
- **VH_REC**: Very High recommendation (some files)
- **Shape_Leng**: Perimeter length
- **Shape_Area**: Area measurement

## Usage

### Test Connection
```bash
node test-connection.js
```

### Inspect Data Structure  
```bash
node inspect-simple.js
```

### Process All Data
```bash
node process-gis.js
```

### Process with Inspection Only
```bash
node process-gis.js --inspect
```

## Files Explained

- `process-gis.js` - Main processing script
- `inspect-simple.js` - Data structure inspection
- `test-connection.js` - Test Supabase connection
- `setup-guide.md` - This guide

## Troubleshooting

1. **Invalid URL Error**: Make sure your SUPABASE_URL and SUPABASE_KEY are set correctly in .env
2. **Permission Errors**: Ensure RLS is disabled or you have proper policies
3. **Coordinate Issues**: The script handles coordinate transformation automatically
4. **Large Data**: Processing is done in chunks of 1000 records
