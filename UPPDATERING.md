# Den stora uppdateringen

Elvin och Claude kom på det här tillsammans den 20 oktober 2026. Det blev roligt i början att spela med en kompis men snabbt långtråkigt, för det fanns inget att göra *tillsammans*. Därför kommer lekarna med kompisar först.

Varje punkt blir en egen PR. Vi tar dem i ordning och bockar av när de är klara. Kör `npm test` före varje PR, och spela in en ny baseline (`npm run baseline`) i en egen commit när spelet har ändrats.

## Del 1: Lekar med kompisar

Lekarna läggs i en ny fil, `src/party.js`, som laddas direkt efter `src/multiplayer.js`. Den som har rummet startar en lek från rumsskylten (P), och alla i rummet är med.

- [x] **Polis och tjuv.** En spelare är polis och får en polisbil med blåljus, de andra är tjuvar. Polisen tar en tjuv genom att köra in i hen eller springa ikapp. En runda är 3 minuter. Tjuvarna får poäng för varje sekund de är fria, och polisen får sekunderna som var kvar för varje tjuv hen tar. Sedan byter ni roller. Poängen står uppe på skärmen. (Klar: `src/party.js`.)
- [x] **Gatlopp mot varandra.** Den som har rummet väljer ett av de fyra gatloppen. Alla flyttas till startpelaren och får samma nedräkning. Under loppet syns vem som leder (1:a, 2:a, 3:a…), och i mål kommer en prispall med tiderna. (Klar: `src/party.js`, med loppen från `JOBS`.)
- [x] **Kurragömma.** En letar, de andra gömmer sig. De som gömmer sig har 60 sekunder på sig medan den som letar har svart skärm. Sedan syns de inte på kartan och namnet syns inte genom husen. Den som letar hittar någon genom att gå eller köra nära nog. Sista som hittas vinner. (Klar: `src/party.js`. Rundan är fyra minuter, och poängen räknas som i polis och tjuv.)

## Del 2: Köra snabbare och snyggare

- [ ] ~~**Nitro.**~~ Elvin valde att hoppa över nitron. (Det som stod: en knapp (förslag: Shift i bilen) ger en kraftig spark framåt, med blå låga ur avgasröret och ett eget ljud. En mätare visar hur mycket nitro som är kvar, och den fylls på sakta.)
- [x] **Verkstaden.** En verkstad i stan (förslag: på Söder) där du köper ny färg, andra fälgar, sänkt fjädring och bättre motor för pengarna i Kassan. Det du köper sparas för den bilen. (Klar: `src/workshop.js`. Verkstaden ligger på Götgatan mellan Åsögatan och Skånegatan. Där går det också att laga bilen, och ny lack får polisen att tappa bort dig.)

## Del 3: Stan lever

- [x] **Dag och natt.** Ett dygn i spelet tar ungefär 20 minuter. Solen går ner, himlen blir orange och sedan mörk, gatlamporna och fönstren tänds och bilarna kör med strålkastare. Den som har rummet bestämmer tiden för alla. (Klar: `src/daynight.js`. Klockan står på gatuskylten, på natten syns stjärnor och en måne, och O spolar fram en timme.)
- [x] **Väder.** Ibland regnar det (blöta gator som glänser, vindrutetorkare, sämre grepp) och på vintern snöar det (vita tak och halt på vägen). (Klar: `src/weather.js`. U byter väder, i kraftigt regn åskar det, och vintern är november till mars.)
- [x] **Vattenballonger.** Köp vattenballonger hos ballongförsäljarna och kasta dem med en knapp. De plaskar, gör den du träffar blöt, och träffar du en polis blir du jagad. Fungerar på kompisar också. (Klar: `src/water-balloons.js`. Hinken står bredvid ballongförsäljaren, och man kastar med ett klick eller F.)

## Del 4: Nivåer och belöningar

- [x] **Nivåer och troféer.** Du får XP för allt du gör: jobb, gatlopp, dalahästar, lekarna med kompisar. Nya nivåer låser upp saker (till exempel verkstadens dyraste delar). Troféer för saker som "kör 300 km/h", "fly från fem stjärnor" eller "ta alla dalahästar". Allt sparas i webbläsaren. (Klar: `src/progress.js`. Tryck I för nivån och de 18 troféerna. Nivåerna låser upp verkstadens bästa fälgar, fjädring, guldlack och motor.)
- [x] **Dagliga utmaningar.** Tre nya små utmaningar varje dag, till exempel "hitta 2 dalahästar", "kör 5 km taxi" eller "hoppa 50 meter". De ger pengar och XP. (Klar: `src/daily.js`. En lätt, en svårare och en svår varje dag, valda efter datumet. "Hoppa 50 meter" blev 50 meters fritt fall med fallskärmen, eftersom bilarna inte kan hoppa. De står på tavlan under I.)
- [x] **Garaget.** Köp bilar för pengarna du tjänar och ställ dem i ett eget garage (förslag: under det gula huset i Drakens gränd). Bilarna du köpt står kvar med sin färg och sina delar från verkstaden. (Klar: `src/garage.js`. Porten ligger på Skeppsbron vid hörnet av Drakens gränd, och hallen med tio platser under gula huset. Bilhandeln finns i garaget.)

## Del 5: Upp i luften och under jorden

- [x] **Flyga helikopter.** En helikopterplatta (förslag: på Kaknästornet och vid Skeppsbron) med en helikopter du kan flyga själv. Polisens helikopter finns redan, så modellen kan användas igen. (Klar: `src/helicopter.js`. Plattan står vid Skeppsbron, och på Kaknästornet finns en landningsring runt masten.)
- [x] **Fallskärm.** Hoppa ur helikoptern eller från Kaknästornet och Hötorgsskraporna. Fallskärmen vecklas ut med en knapp, och du styr när du glider ner. (Klar: `src/parachute.js`. Hötorgsskrapan är den södra av de fem.)
- [x] **Tunnelbanan.** Gå ner i en tunnelbaneuppgång och välj en annan station. Tåget åker genom en tunnel och du kommer upp vid den stationen. (Klar: `src/metro.js`. Biljetten kostar 39 kr, och utan pengar kan man planka.)
- [x] **Gröna Lunds attraktioner.** Gå fram till fritt fall-tornet, karusellen eller berg-och-dalbanan och tryck E för att åka. Kameran sitter i vagnen. (Klar: `src/rides.js`. Pariserhjulet går också att åka, och berg-och-dalbanan fick ett tåg.)

## Del 6: Nya önskemål

Elvin önskade de här den 26 oktober 2026, så de kommer före storyn.

- [x] **Fyra nya superbilar som måste köpas.** Bugatti Tourbillon, Rimac Nevera, Ferrari F80 och McLaren W1 blir de bästa bilarna i spelet. De går bara att köpa i bilhandeln i garaget. Man kan inte välja dem med B eller ta dem i trafiken. (Klar: de ligger sist i `MODELS` i `src/vehicles/models.js` med `buy` och ett eget pris, under "Nyheter, bara här" i bilhandeln.) Elvin ville sedan att också hyperbilarna Chiron, Huayra, Jesko och LaFerrari bara ska gå att köpa, och att man hämtar dem i garaget.
- [x] **Fler sätt att tjäna pengar.** Elvin tyckte att de nya bilarna blev väldigt dyra. (Klar: `src/cash.js`. Jobben och gatloppen betalar dubbelt, 15 pengapåsar gömmer sig i stan varje dag, drift och "nära ögat" ger pengar, och du får 250 kr per stjärna när du kommer undan polisen.)
- [x] **Polisuppdrag i fred.** När du kör ett polisuppdrag kan polisen inte stoppa dig. (Klar: `startChase` i `src/police.js` gör ingenting medan du har ett polisuppdrag, och en jakt du redan är i slutar när uppdraget börjar.)
- [x] **Olika tid och väder när spelet startar.** Inte alltid dag och sol. Det kan vara natt med åska, snö på kvällen eller något annat. (Klar: när du trycker Spela slumpar `WEATHER.surprise` och `DAYNIGHT.surprise` vädret och tiden, och en skylt säger vad klockan är. I en väns rum gäller den som har rummets tid och väder.)
- [x] **Alla jobb på en tavla.** En tangent som visar alla jobb man kan göra, vad de ger och vilken bil som behövs. (Klar: J när det inte finns något jobb att starta, eller knappen Jobb på mobilen, öppnar tavlan. Kör! hämtar fordonet och startar jobbet.)
- [x] **Vägbeskrivning.** Sätt ett eget mål på kartan, så visar GPS:en vägen dit, på kartan i hörnet och med en ljuspelare i stan.
- [x] **Konto med inloggning.** Logga in med namn och lösenord, så sparas nivån, garaget, de trimmade bilarna och resten på en server (förslag: Firebase, gratis), och du får tillbaka allt var du än spelar.

## Del 7: Storyn

- [x] **Uppdrag med en story.** En rad uppdrag som hänger ihop, till exempel ett stort rån som slutar med en jakt genom hela stan och en flykt med båt. Den kommer sist, eftersom den kan använda allt det andra (helikoptern, fallskärmen, nitron, natten). (Klar: `src/story.js`. Elvin ville att polisen ska vara de goda, så du hjälper kommissarie Kicki Lind att stoppa en kupp mot Nationalmuseum i fem uppdrag: tipset, spaningen med helikoptern, larmet på natten, båtjakten och hoppet från Kaknästornet.)

## Del 8: Mer story

- [x] **Storyn, kapitel 2.** Elvin tyckte att storyn var kul och ville ha fler uppdrag som hänger ihop. (Klar: kapitel 2, Kungakronan, i `src/story.js`. Bossen från kapitel 1 jobbade åt Mästaren, som vill stjäla kungakronan. Fem uppdrag med tunnelbanan, Högvakten, pariserhjulet och vattenballonger, en stormig natt i helikoptern och en jakt på vattenskoter.)
- [x] **Storyn, kapitel 3.** Elvin och Claude hittar på den tillsammans. (Klar: kapitel 3, Mästarens hämnd, i `src/story.js`. Elvin valde att Mästaren rymmer, att slutet blir på Globen och att det ska vara biljakter, flygning och smygande. Fem uppdrag: en biljakt från Centralbron, att skugga en medhjälpare till fots till Stureplan, att fota ett lager i Hammarby sjöstad från helikoptern, att stoppa en skåpbil på väg mot Globen, och en final med landning på Globens tak.)

---

## Fler idéer

*(Skriv hit nya idéer när ni kommer på dem.)*
