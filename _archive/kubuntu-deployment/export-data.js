import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function exportData() {
  try {
    console.log('Getting list of tables...');
    const tablesQuery = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    
    const tables = tablesQuery.map(row => row.table_name);
    console.log(`Found ${tables.length} tables:`, tables.join(', '));
    
    const data = {};
    
    for (const table of tables) {
      console.log(`Exporting ${table}...`);
      const rows = await sql(`SELECT * FROM ${table}`);
      data[table] = rows;
      console.log(`  ✓ ${rows.length} rows`);
    }
    
    console.log('\nWriting to data-export.json...');
    const fs = await import('fs/promises');
    await fs.writeFile(
      'kubuntu-deployment/data-export.json',
      JSON.stringify(data, null, 2)
    );
    
    console.log('✓ Export complete!');
    console.log(`Total tables: ${tables.length}`);
    
    let totalRows = 0;
    for (const table in data) {
      totalRows += data[table].length;
    }
    console.log(`Total rows exported: ${totalRows}`);
  } catch (error) {
    console.error('Export failed:', error);
    process.exit(1);
  }
}

exportData();
