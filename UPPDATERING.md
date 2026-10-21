# Den stora uppdateringen

Elvin och Claude kom på det här tillsammans den 20 oktober 2026. Det blev roligt i början att spela med en kompis men snabbt långtråkigt, för det fanns inget att göra *tillsammans*. Därför kommer lekarna med kompisar först.

Varje punkt blir en egen PR. Vi tar dem i ordning och bockar av när de är klara. Kör `npm test` före varje PR, och spela in en ny baseline (`npm run baseline`) i en egen commit när spelet har ändrats.

## Del 1: Lekar med kompisar

Lekarna läggs i en ny fil, `src/party.js`, som laddas direkt efter `src/multiplayer.js`. Den som har rummet startar en lek från rumsskylten (P), och alla i rummet är med.

- [x] **Polis och tjuv.** En spelare är polis och får en polisbil med blåljus, de andra är tjuvar. Polisen tar en tjuv genom att köra in i hen eller springa ikapp. En runda är 3 minuter. Tjuvarna får poäng för varje sekund de är fria, och polisen får sekunderna som var kvar för varje tjuv hen tar. Sedan byter ni roller. Poängen står uppe på skärmen. (Klar: `src/party.js`.)
- [ ] **Gatlopp mot varandra.** Den som har rummet väljer ett av de fyra gatloppen. Alla flyttas till startpelaren och får samma nedräkning. Under loppet syns vem som leder (1:a, 2:a, 3:a…), och i mål kommer en prispall med tiderna.
- [ ] **Kurragömma.** En letar, de andra gömmer sig. De som gömmer sig har 60 sekunder på sig medan den som letar har svart skärm. Sedan syns de inte på kartan och namnet syns inte genom husen. Den som letar hittar någon genom att gå eller köra nära nog. Sista som hittas vinner.

## Del 2: Köra snabbare och snyggare

- [ ] **Nitro.** En knapp (förslag: Shift i bilen) ger en kraftig spark framåt, med blå låga ur avgasröret och ett eget ljud. En mätare visar hur mycket nitro som är kvar, och den fylls på sakta.
- [ ] **Verkstaden.** En verkstad i stan (förslag: på Söder) där du köper ny färg, andra fälgar, sänkt fjädring, bättre motor och nitro för pengarna i Kassan. Det du köper sparas för den bilen.

## Del 3: Stan lever

- [ ] **Dag och natt.** Ett dygn i spelet tar ungefär 20 minuter. Solen går ner, himlen blir orange och sedan mörk, gatlamporna och fönstren tänds och bilarna kör med strålkastare. Den som har rummet bestämmer tiden för alla.
- [ ] **Väder.** Ibland regnar det (blöta gator som glänser, vindrutetorkare, sämre grepp) och på vintern snöar det (vita tak och halt på vägen).
- [ ] **Vattenballonger.** Köp vattenballonger hos ballongförsäljarna och kasta dem med en knapp. De plaskar, gör den du träffar blöt, och träffar du en polis blir du jagad. Fungerar på kompisar också.

## Del 4: Nivåer och belöningar

- [ ] **Nivåer och troféer.** Du får XP för allt du gör: jobb, gatlopp, dalahästar, lekarna med kompisar. Nya nivåer låser upp saker (till exempel verkstadens dyraste delar). Troféer för saker som "kör 300 km/h", "fly från fem stjärnor" eller "ta alla dalahästar". Allt sparas i webbläsaren.
- [ ] **Dagliga utmaningar.** Tre nya små utmaningar varje dag, till exempel "hitta 2 dalahästar", "kör 5 km taxi" eller "hoppa 50 meter". De ger pengar och XP.
- [ ] **Garaget.** Köp bilar för pengarna du tjänar och ställ dem i ett eget garage (förslag: under det gula huset i Drakens gränd). Bilarna du köpt står kvar med sin färg och sina delar från verkstaden.

## Del 5: Upp i luften och under jorden

- [ ] **Flyga helikopter.** En helikopterplatta (förslag: på Kaknästornet och vid Skeppsbron) med en helikopter du kan flyga själv. Polisens helikopter finns redan, så modellen kan användas igen.
- [ ] **Fallskärm.** Hoppa ur helikoptern eller från Kaknästornet och Hötorgsskraporna. Fallskärmen vecklas ut med en knapp, och du styr när du glider ner.
- [ ] **Tunnelbanan.** Gå ner i en tunnelbaneuppgång och välj en annan station. Tåget åker genom en tunnel och du kommer upp vid den stationen.
- [ ] **Gröna Lunds attraktioner.** Gå fram till fritt fall-tornet, karusellen eller berg-och-dalbanan och tryck E för att åka. Kameran sitter i vagnen.

## Del 6: Storyn

- [ ] **Uppdrag med en story.** En rad uppdrag som hänger ihop, till exempel ett stort rån som slutar med en jakt genom hela stan och en flykt med båt. Den kommer sist, eftersom den kan använda allt det andra (helikoptern, fallskärmen, nitron, natten).

---

## Fler idéer

*(Skriv hit nya idéer när ni kommer på dem.)*
