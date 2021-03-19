---
layout: default
title: Countdown
permalink: /countdown/
---

<p id="countdown"></p>

<script>
var countDownDate = new Date("Jun 17, 2021 17:00:00").getTime();

var x = setInterval(function() {

  var now = new Date().getTime();
  var distance = countDownDate - now;
  var days = Math.floor(distance / (1000 * 60 * 60 * 24));
  var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
  var seconds = Math.floor((distance % (1000 * 60)) / 1000);

  document.getElementById("countdown").innerHTML = days + "d " + hours + "h " + minutes + "m " + seconds + "s ";

  if (distance < 0) {
    clearInterval(x);
    document.getElementById('countdown').innerHTML = '<img src="https://media.giphy.com/media/kyLYXonQYYfwYDIeZl/source.gif"/>'
  }
}, 1000);
</script>
