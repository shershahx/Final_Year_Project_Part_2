const fs = require('fs');
const hecPath = '/home/talha/FYP- project/frontend/src/pages/hec/VerifiedDegrees.js';
const approverPath = '/home/talha/FYP- project/frontend/src/pages/approver/ApproverDashboard.js';

let hecCode = fs.readFileSync(hecPath, 'utf8');
hecCode = hecCode.replace(/\/\/ Simplified: directly embed the URL[\s\S]*?\}, \[directUrl\]\);/m, 
`    useEffect(() => {
        let alive = true;
        let created = null;
        setPdfState('loading');
        setPdfError('');
        setBlobUrl(null);

        // Fetch ensures we download the PDF natively as a Blob so Chrome doesn't block cross-origin PDF embedding!
        fetch(directUrl)
            .then(res => {
                if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
                return res.blob();
            })
            .then(blob => {
                if (!alive) return;
                const url = URL.createObjectURL(blob);
                created = url;
                setBlobUrl(url);
                setPdfState('ready');
            })
            .catch(err => {
                if (!alive) return;
                setPdfError(err.message || 'Failed to load PDF');
                setPdfState('error');
            });

        return () => {
            alive = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [directUrl]);`);

fs.writeFileSync(hecPath, hecCode);

let apprCode = fs.readFileSync(approverPath, 'utf8');
apprCode = apprCode.replace(/\/\/ Simplified: directly embed the URL[\s\S]*?\}, \[directUrl\]\);/m, 
`    useEffect(() => {
        let alive = true;
        let created = null;
        setPdfState('loading');
        setPdfError('');
        setBlobUrl(null);

        // Fetch ensures we download the PDF natively as a Blob so Chrome doesn't block cross-origin PDF embedding!
        fetch(directUrl)
            .then(res => {
                if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
                return res.blob();
            })
            .then(blob => {
                if (!alive) return;
                const url = URL.createObjectURL(blob);
                created = url;
                setBlobUrl(url);
                setPdfState('ready');
            })
            .catch(err => {
                if (!alive) return;
                setPdfError(err.message || 'Failed to load PDF');
                setPdfState('error');
            });

        return () => {
            alive = false;
            if (created) URL.revokeObjectURL(created);
        };
    }, [directUrl]);`);

fs.writeFileSync(approverPath, apprCode);
