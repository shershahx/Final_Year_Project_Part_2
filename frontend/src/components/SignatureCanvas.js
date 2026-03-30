import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { FaEraser, FaSave } from 'react-icons/fa';

const SignatureDrawCanvas = ({ onSave }) => {
    const sigCanvas = useRef(null);
    const [isEmpty, setIsEmpty] = useState(true);

    const clear = () => {
        sigCanvas.current.clear();
        setIsEmpty(true);
    };

    const save = () => {
        if (sigCanvas.current.isEmpty()) {
            alert('Please draw your signature first');
            return;
        }

        // Get signature as base64 image
        const signatureData = sigCanvas.current.toDataURL('image/png');
        onSave(signatureData);
    };

    const handleEnd = () => {
        setIsEmpty(sigCanvas.current.isEmpty());
    };

    return (
        <div style={{ width: '100%' }}>
            <div style={{ border: '2px solid #ddd', borderRadius: '8px', backgroundColor: 'white' }}>
                <SignatureCanvas
                    ref={sigCanvas}
                    penColor="black"
                    minWidth={2.0}
                    maxWidth={5.0}
                    canvasProps={{
                        width: 500,
                        height: 200,
                        className: 'signature-canvas',
                        style: { width: '100%' }
                    }}
                    onEnd={handleEnd}
                />
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button
                    type="button"
                    onClick={clear}
                    className="btn btn-danger"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                    <FaEraser /> Clear
                </button>
                <button
                    type="button"
                    onClick={save}
                    disabled={isEmpty}
                    className="btn btn-success"
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        opacity: isEmpty ? 0.5 : 1,
                        cursor: isEmpty ? 'not-allowed' : 'pointer'
                    }}
                >
                    <FaSave /> Save Signature
                </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem', textAlign: 'center' }}>
                Draw your signature in the box above
            </p>
        </div>
    );
};

export default SignatureDrawCanvas;
