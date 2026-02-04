const bcrypt = require('bcryptjs');

// Generate password hash for admin user
const generateAdminPassword = async () => {
    const password = process.argv[2] || 'admin123';
    
    console.log('\n🔐 Generating Admin Password Hash\n');
    console.log('Password:', password);
    console.log('\nHashing...\n');
    
    const hash = await bcrypt.hash(password, 10);
    
    console.log('Password Hash:');
    console.log(hash);
    console.log('\n📝 Use this SQL command to update admin password:\n');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = 'admin@gundusudhi.com';\n`);
    console.log('⚠️  Remember to change the default password in production!\n');
};

generateAdminPassword().catch(console.error);
