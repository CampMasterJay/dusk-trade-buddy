
DROP POLICY IF EXISTS "Users can manage their own behavioral snapshots" ON public.behavioral_snapshots;
CREATE POLICY "Users can manage their own behavioral snapshots" ON public.behavioral_snapshots FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own challenges" ON public.challenges;
CREATE POLICY "Users can manage their own challenges" ON public.challenges FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own earnings events" ON public.earnings_events;
CREATE POLICY "Users can manage their own earnings events" ON public.earnings_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own playbook entries" ON public.playbook_entries;
CREATE POLICY "Users can manage their own playbook entries" ON public.playbook_entries FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own price alerts" ON public.price_alerts;
CREATE POLICY "Users can manage their own price alerts" ON public.price_alerts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own scaling tiers" ON public.scaling_tiers;
CREATE POLICY "Users can manage their own scaling tiers" ON public.scaling_tiers FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own achievements" ON public.user_achievements;
CREATE POLICY "Users can manage their own achievements" ON public.user_achievements FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own weekly debriefs" ON public.weekly_debriefs;
CREATE POLICY "Users can manage their own weekly debriefs" ON public.weekly_debriefs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
