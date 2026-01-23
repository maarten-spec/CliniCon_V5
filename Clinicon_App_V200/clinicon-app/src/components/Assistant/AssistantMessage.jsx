import React from 'react';

export const AssistantMessage = ({ msg, onConfirm, onCancel }) => {
    const isUser = msg.type === 'user';

    if (isUser) {
        return (
            <div className="msg msg-user">
                {msg.content}
            </div>
        );
    }

    // Handle structured proposals (Cards)
    if (msg.isProposal && msg.proposal) {
        const { fields, intent } = msg.proposal;
        const isPending = msg.status === 'pending';
        const isExecuted = msg.status === 'executed';
        const isCancelled = msg.status === 'cancelled';

        let statusLabel = null;
        if (isExecuted) statusLabel = <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Ausgeführt</span>;
        if (isCancelled) statusLabel = <span style={{ color: '#ef4444' }}>✗ Abgebrochen</span>;

        return (
            <div className="msg-card">
                <div className="card-title">
                    Vorschlag: {mapIntentToLabel(intent)}
                    {statusLabel && <div style={{ fontSize: '0.8em', marginTop: 4 }}>{statusLabel}</div>}
                </div>

                <div className="card-details">
                    {fields.employee_name && (
                        <div className="card-detail-row">
                            <span>Mitarbeiter:</span>
                            <strong>{fields.employee_name}</strong>
                        </div>
                    )}
                    {fields.month && (
                        <div className="card-detail-row">
                            <span>Zeitraum:</span>
                            <strong>{fields.month} {fields.year}</strong>
                        </div>
                    )}
                    {fields.target_fte !== null && fields.target_fte !== undefined && (
                        <div className="card-detail-row">
                            <span>Neuer Wert:</span>
                            <strong>{fields.target_fte} VK</strong>
                        </div>
                    )}
                    {fields.delta_fte !== null && fields.delta_fte !== undefined && (
                        <div className="card-detail-row">
                            <span>Änderung:</span>
                            <strong>{fields.delta_fte > 0 ? '+' : ''}{fields.delta_fte} VK</strong>
                        </div>
                    )}
                </div>

                {isPending && (
                    <div className="card-actions">
                        <button className="btn btn-small btn-ghost" onClick={() => onCancel(msg.id)}>
                            Ablehnen
                        </button>
                        <button className="btn btn-small btnPrimary" onClick={() => onConfirm(msg.id, msg.proposal)}>
                            Bestätigen
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Regular text response
    return (
        <div className="msg msg-ai">
            {msg.content}
        </div>
    );
};

function mapIntentToLabel(intent) {
    switch (intent) {
        case 'adjust_person_fte_rel': return 'Stellenanteil anpassen';
        case 'adjust_person_fte_abs': return 'Stellenanteil setzen';
        case 'move_employee_unit': return 'Mitarbeiter versetzen';
        default: return 'Aktion ausführen';
    }
}
