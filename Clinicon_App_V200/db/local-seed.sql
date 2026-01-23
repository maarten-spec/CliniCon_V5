INSERT OR IGNORE INTO organisationseinheit (code, name, einheitstyp, aktiv)
VALUES
('STA1','Station 1','STATION',1),
('STA2','Station 2','STATION',1),
('OP','OP','FUNKTION',1),
('ENDO','Endoskopie','FUNKTION',1),
('PDL','Pflegedienstleitung','BEREICH',1);

INSERT OR IGNORE INTO qualifikation (code, bezeichnung, pflicht, sortierung, aktiv)
VALUES
('PFK','Pflegefachkraft',1,10,1),
('PFA','Pflegefachassistenz',1,20,1),
('UNGEL','Ungelernte Kraft',1,30,1);
