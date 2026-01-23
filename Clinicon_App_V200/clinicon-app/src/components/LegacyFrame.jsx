import React from "react";

export default function LegacyFrame({ src }){
  return (
    <div style={{ height:"calc(100vh - 64px - 16px - 16px - 32px)", minHeight:680 }}>
      <iframe
        title={src}
        src={src}
        style={{
          width:"100%",
          height:"100%",
          border:"0",
          borderRadius:16,
          background:"#fff"
        }}
      />
    </div>
  );
}
